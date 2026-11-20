// Raciocínio de consultora financeira (100% por regras, sem IA generativa e sem custo).
// Em vez de só responder números, a assistente lê a situação inteira do usuário, pesa o que é mais grave,
// explica o porquê e propõe o próximo passo, sempre com números que o próprio app calculou.
// As referências ("3 a 6 meses de reserva", "até 80% da renda em gastos", "parcelas até 30% da renda") são
// regras gerais de educação financeira, ditas como tal; nada aqui é recomendação de investimento.
import { formatCentsToBRL as brl, formatDate } from '../format'
import { groupTransactionsByInvoice, transactionDueDate } from '../invoices'
import { computeForecast } from '../forecast'
import { totalLiquidBalanceCents } from '../accountTypes'
import { addDaysISO } from './nlu'
import type { AssistantContext, Reply } from './engine'
import type { Account, TransactionWithRelations } from '../../types/database'

const pct = (n: number) => `${Math.round(n)}%`
const lines = (...l: (string | null | false | undefined)[]) => l.filter((x): x is string => Boolean(x)).join('\n')
const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0)
const ym = (iso: string) => iso.slice(0, 7)

function monthEnd(today: string) {
  const [y, m] = today.split('-').map(Number)
  const d = new Date(y, m, 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function previousMonths(today: string, n: number): string[] {
  const [y, m] = today.split('-').map(Number)
  const out: string[] = []
  for (let i = 1; i <= n; i++) {
    const d = new Date(y, m - 1 - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

// ---------------------------------------------------------------- métricas

export interface Metrics {
  hasData: boolean
  liquid: number
  avgIncome: number
  avgExpense: number
  surplus: number
  curIncome: number
  curExpense: number
  savingsRate: number | null
  emergencyMonths: number | null
  overdueCount: number
  overdueCents: number
  due7Cents: number
  openInvoicesCents: number
  forecast: ReturnType<typeof computeForecast>
  worstCard: { name: string; usage: number } | null
  installmentMonthly: number
  installmentRatio: number | null
  topCategory: { name: string; share: number } | null
  riser: { name: string; diff: number; ratio: number } | null
  budgetsOver: { name: string; over: number }[]
  goalsLate: { name: string; missing: number; monthly: number | null }[]
  borrowedCents: number
  lentOverdue: number
}

function openInvoices(ctx: AssistantContext) {
  const out: { card: Account; dueDate: string; totalCents: number }[] = []
  for (const card of ctx.accounts.filter((a) => a.type === 'credit_card' && !a.archived)) {
    for (const g of groupTransactionsByInvoice(ctx.transactions.filter((t) => t.account_id === card.id), card)) {
      if (!g.dueDate || g.totalCents <= 0) continue
      if (ctx.transfers.some((t) => t.to_account_id === card.id && t.invoice_period === g.period)) continue
      out.push({ card, dueDate: g.dueDate, totalCents: g.totalCents })
    }
  }
  return out
}

function activeInstallmentSeries(ctx: AssistantContext) {
  const series = new Map<string, TransactionWithRelations[]>()
  for (const t of ctx.transactions) {
    if (t.type !== 'expense' || !t.series_id || (t.installment_total ?? 0) < 2) continue
    series.set(t.series_id, [...(series.get(t.series_id) ?? []), t])
  }
  return [...series.values()].filter((rows) => rows.some((r) => r.date > ctx.today))
}

export function computeMetrics(ctx: AssistantContext): Metrics {
  const today = ctx.today
  const month = ym(today)
  const byMonth = (m: string, type: 'income' | 'expense') =>
    sum(ctx.transactions.filter((t) => t.type === type && ym(t.date) === m), (t) => t.amount_cents)

  const hist = previousMonths(today, 3)
    .map((m) => ({ inc: byMonth(m, 'income'), exp: byMonth(m, 'expense') }))
    .filter((x) => x.inc > 0 || x.exp > 0)
  const curIncome = sum(ctx.transactions.filter((t) => t.type === 'income' && ym(t.date) === month && t.date <= today), (t) => t.amount_cents)
  const curExpense = sum(ctx.transactions.filter((t) => t.type === 'expense' && ym(t.date) === month && t.date <= today), (t) => t.amount_cents)
  const avgIncome = hist.length ? Math.round(sum(hist, (x) => x.inc) / hist.length) : curIncome
  const avgExpense = hist.length ? Math.round(sum(hist, (x) => x.exp) / hist.length) : curExpense

  const liquid = totalLiquidBalanceCents(ctx.accounts.filter((a) => !a.archived))

  const bills = ctx.transactions
    .filter((t) => t.type === 'expense' && !t.applied_to_balance && t.account?.type !== 'credit_card')
    .map((t) => ({ amount: t.amount_cents, due: transactionDueDate(t, t.account) }))
  const invoices = openInvoices(ctx)
  const overdueBills = bills.filter((b) => b.due < today)
  const overdueInv = invoices.filter((i) => i.dueDate < today)
  const horizon = addDaysISO(today, 7)
  const due7Cents =
    sum(bills.filter((b) => b.due >= today && b.due <= horizon), (b) => b.amount) +
    sum(invoices.filter((i) => i.dueDate >= today && i.dueDate <= horizon), (i) => i.totalCents)

  const forecast = computeForecast(ctx.accounts, ctx.transactions, ctx.transfers, today, monthEnd(today))

  let worstCard: Metrics['worstCard'] = null
  for (const card of ctx.accounts.filter((a) => a.type === 'credit_card' && a.credit_limit_cents && !a.archived)) {
    const usage = sum(invoices.filter((i) => i.card.id === card.id), (i) => i.totalCents) / card.credit_limit_cents!
    if (!worstCard || usage > worstCard.usage) worstCard = { name: card.name, usage }
  }

  const installmentMonthly = sum(activeInstallmentSeries(ctx), (rows) => [...rows].sort((a, b) => a.date.localeCompare(b.date))[0].amount_cents)

  // categorias do mês corrente x mesmo período do mês anterior
  const curRows = ctx.transactions.filter((t) => t.type === 'expense' && ym(t.date) === month && t.date <= today)
  const [py, pm] = previousMonths(today, 1)[0].split('-').map(Number)
  const day = Number(today.slice(8, 10))
  const prevFrom = `${py}-${String(pm).padStart(2, '0')}-01`
  const prevTo = `${py}-${String(pm).padStart(2, '0')}-${String(Math.min(day, new Date(py, pm, 0).getDate())).padStart(2, '0')}`
  const prevRows = ctx.transactions.filter((t) => t.type === 'expense' && t.date >= prevFrom && t.date <= prevTo)
  const tot = (rows: TransactionWithRelations[]) => {
    const m = new Map<string, { name: string; cents: number }>()
    for (const t of rows) {
      const id = t.category?.id ?? 'none'
      m.set(id, { name: t.category?.name ?? 'Sem categoria', cents: (m.get(id)?.cents ?? 0) + t.amount_cents })
    }
    return m
  }
  const curCat = tot(curRows)
  const prevCat = tot(prevRows)
  const curTotal = sum(curRows, (t) => t.amount_cents)
  const top = [...curCat.values()].sort((a, b) => b.cents - a.cents)[0]
  const topCategory = top && curTotal > 0 ? { name: top.name, share: top.cents / curTotal } : null
  let riser: Metrics['riser'] = null
  for (const [id, v] of curCat) {
    const before = prevCat.get(id)?.cents ?? 0
    const diff = v.cents - before
    if (diff >= 10000 && before > 0 && diff / before >= 0.3 && (!riser || diff > riser.diff)) riser = { name: v.name, diff, ratio: diff / before }
  }

  const names = new Map(ctx.categories.map((c) => [c.id, c.name]))
  const spent = new Map<string, number>()
  for (const t of curRows) if (t.category_id) spent.set(t.category_id, (spent.get(t.category_id) ?? 0) + t.amount_cents)
  const budgetsOver = ctx.budgets
    .map((b) => ({ name: names.get(b.category_id) ?? 'Categoria', over: (spent.get(b.category_id) ?? 0) - b.amount_cents }))
    .filter((b) => b.over > 0)
    .sort((a, b) => b.over - a.over)

  const [ty, tm] = today.split('-').map(Number)
  const goalsLate: Metrics['goalsLate'] = []
  for (const g of ctx.goals.filter((x) => !x.archived && x.deadline && x.accumulated_cents < x.target_cents)) {
    const [dy, dm] = g.deadline!.split('-').map(Number)
    const months = (dy - ty) * 12 + (dm - tm)
    const missing = g.target_cents - g.accumulated_cents
    if (months <= 0) goalsLate.push({ name: g.name, missing, monthly: null })
    else goalsLate.push({ name: g.name, missing, monthly: Math.ceil(missing / months) })
  }

  const paid = new Map<string, number>()
  for (const p of ctx.loanPayments) paid.set(p.loan_id, (paid.get(p.loan_id) ?? 0) + p.amount_cents)
  const pending = (l: { id: string; principal_cents: number }) => Math.max(0, l.principal_cents - (paid.get(l.id) ?? 0))
  const openLoans = ctx.loans.filter((l) => !l.archived && pending(l) > 0)
  const borrowedCents = sum(openLoans.filter((l) => l.direction === 'borrowed'), pending)
  const lentOverdue = openLoans.filter((l) => l.direction === 'lent' && l.due_date && l.due_date < today).length

  const surplus = avgIncome - avgExpense
  return {
    hasData: ctx.transactions.length > 0,
    liquid,
    avgIncome,
    avgExpense,
    surplus,
    curIncome,
    curExpense,
    savingsRate: avgIncome > 0 ? (surplus / avgIncome) * 100 : null,
    emergencyMonths: avgExpense > 0 ? Math.max(0, liquid) / avgExpense : null,
    overdueCount: overdueBills.length + overdueInv.length,
    overdueCents: sum(overdueBills, (b) => b.amount) + sum(overdueInv, (i) => i.totalCents),
    due7Cents,
    openInvoicesCents: sum(invoices, (i) => i.totalCents),
    forecast,
    worstCard,
    installmentMonthly,
    installmentRatio: avgIncome > 0 ? installmentMonthly / avgIncome : null,
    topCategory,
    riser,
    budgetsOver,
    goalsLate,
    borrowedCents,
    lentOverdue,
  }
}

// ---------------------------------------------------------------- achados (o "raciocínio")

export interface Finding {
  id: string
  sev: 'alert' | 'warn' | 'ok'
  /** quanto maior, mais urgente */
  weight: number
  title: string
  detail: string
  action?: string
}

export function findings(ctx: AssistantContext, m = computeMetrics(ctx)): Finding[] {
  const out: Finding[] = []
  const f = m.forecast

  if (m.overdueCount > 0) {
    out.push({
      id: 'overdue',
      sev: 'alert',
      weight: 100,
      title: `${m.overdueCount} ${m.overdueCount === 1 ? 'conta atrasada' : 'contas atrasadas'}`,
      detail: `Somam ${brl(m.overdueCents)} e costumam render multa e juros a cada dia.`,
      action: `Quite primeiro o que está atrasado (${brl(m.overdueCents)}). Nada rende mais do que parar de pagar juros.`,
    })
  }

  if (f.firstNegativeDate) {
    out.push({
      id: 'forecast',
      sev: 'alert',
      weight: 95,
      title: 'Saldo previsto negativo',
      detail: `Com o que já está lançado, o saldo fica negativo a partir de ${formatDate(f.firstNegativeDate)} (ponto mais baixo ${brl(f.minCents)}).`,
      action: `Evite novos gastos até ${formatDate(f.firstNegativeDate)}, negocie a data das contas maiores ou antecipe recebimentos para cobrir ${brl(Math.abs(f.minCents))}.`,
    })
  } else if (m.due7Cents > 0 && m.due7Cents > m.liquid && m.liquid >= 0) {
    out.push({
      id: 'cash7',
      sev: 'alert',
      weight: 90,
      title: 'Contas da semana maiores que o saldo',
      detail: `Vencem ${brl(m.due7Cents)} nos próximos 7 dias e você tem ${brl(m.liquid)} nas contas.`,
      action: 'Veja o que dá para adiar ou o que está para ser recebido antes disso.',
    })
  }

  if (m.worstCard && m.worstCard.usage >= 0.7) {
    const high = m.worstCard.usage >= 0.9
    out.push({
      id: 'card',
      sev: high ? 'alert' : 'warn',
      weight: high ? 80 : 55,
      title: `${m.worstCard.name} usando ${pct(m.worstCard.usage * 100)} do limite`,
      detail: 'Cartão perto do limite deixa pouca folga para imprevistos e pesa nas próximas faturas.',
      action: `Pare de usar o ${m.worstCard.name} até a fatura baixar e prefira pagar à vista no débito.`,
    })
  }

  if (m.savingsRate !== null) {
    if (m.savingsRate < 0) {
      out.push({
        id: 'savings',
        sev: 'alert',
        weight: 85,
        title: 'Gastando mais do que ganha',
        detail: `Na média dos últimos meses, os gastos (${brl(m.avgExpense)}) passam da renda (${brl(m.avgIncome)}) em ${brl(Math.abs(m.surplus))} por mês. Essa diferença sai do saldo ou vira dívida.`,
        action: `Cortar ${brl(Math.abs(m.surplus))} por mês dos gastos variáveis (começando pelas maiores categorias) fecha essa conta.`,
      })
    } else if (m.savingsRate < 10) {
      out.push({
        id: 'savings',
        sev: 'warn',
        weight: 50,
        title: `Sobra pouco: ${pct(m.savingsRate)} da renda`,
        detail: `Você guarda em média ${brl(m.surplus)} por mês. A regra geral é separar cerca de 20% da renda (${brl(Math.round(m.avgIncome * 0.2))}).`,
        action: `Separe ${brl(Math.round(m.avgIncome * 0.1))} (10%) assim que a renda entrar e suba aos poucos.`,
      })
    } else if (m.savingsRate >= 20) {
      out.push({ id: 'savings', sev: 'ok', weight: 10, title: `Ótima taxa de economia: ${pct(m.savingsRate)}`, detail: `Sobram em média ${brl(m.surplus)} por mês.` })
    }
  }

  if (m.emergencyMonths !== null && m.avgExpense > 0) {
    const months = m.emergencyMonths
    if (months < 1) {
      out.push({
        id: 'reserve',
        sev: 'alert',
        weight: 70,
        title: 'Sem colchão para emergências',
        detail: `O saldo das contas cobre só ${months.toFixed(1).replace('.', ',')} mês do seu gasto médio (${brl(m.avgExpense)}). A regra geral é ter de 3 a 6 meses.`,
        action: `Primeiro objetivo: juntar 1 mês de gastos (${brl(m.avgExpense)}), separando um valor fixo todo mês.`,
      })
    } else if (months < 3) {
      out.push({
        id: 'reserve',
        sev: 'warn',
        weight: 45,
        title: `Reserva de ${months.toFixed(1).replace('.', ',')} meses`,
        detail: `O saldo cobre ${months.toFixed(1).replace('.', ',')} meses do gasto médio. O recomendado é de 3 a 6 (${brl(m.avgExpense * 3)} a ${brl(m.avgExpense * 6)}).`,
        action: `Direcione parte da sobra mensal para uma meta de reserva até chegar a ${brl(m.avgExpense * 3)}.`,
      })
    } else if (months >= 6) {
      out.push({ id: 'reserve', sev: 'ok', weight: 10, title: `Reserva sólida: ${months.toFixed(1).replace('.', ',')} meses`, detail: 'Você tem folga para imprevistos.' })
    }
  }

  if (m.installmentRatio !== null && m.installmentRatio > 0.3) {
    out.push({
      id: 'install',
      sev: 'warn',
      weight: 60,
      title: `Parcelas comprometem ${pct(m.installmentRatio * 100)} da renda`,
      detail: `Você paga cerca de ${brl(m.installmentMonthly)} por mês em compras parceladas/recorrentes. A regra geral é manter abaixo de 30%.`,
      action: 'Evite novas compras parceladas até as atuais terminarem.',
    })
  }

  if (m.budgetsOver.length > 0) {
    const b = m.budgetsOver[0]
    out.push({
      id: 'budget',
      sev: 'warn',
      weight: 52,
      title: `${b.name} estourou o orçamento`,
      detail: `Passou ${brl(b.over)} do limite que você mesmo definiu${m.budgetsOver.length > 1 ? ` (e mais ${m.budgetsOver.length - 1} ${m.budgetsOver.length === 2 ? 'categoria' : 'categorias'})` : ''}.`,
      action: `Segure ${b.name} no resto do mês ou ajuste o orçamento se ele não for realista.`,
    })
  }

  if (m.riser) {
    out.push({
      id: 'riser',
      sev: 'warn',
      weight: 40,
      title: `${m.riser.name} subiu ${pct(m.riser.ratio * 100)}`,
      detail: `Gasto ${brl(m.riser.diff)} a mais do que no mesmo ponto do mês passado.`,
      action: `Revise os lançamentos de ${m.riser.name}: se foi pontual, tudo certo; se virou hábito, vale um teto.`,
    })
  }

  if (m.topCategory && m.topCategory.share >= 0.4) {
    out.push({
      id: 'concentration',
      sev: 'warn',
      weight: 35,
      title: `${m.topCategory.name} concentra ${pct(m.topCategory.share * 100)} dos gastos`,
      detail: 'Quando uma categoria pesa tanto, pequenos cortes nela rendem mais do que mexer no resto.',
      action: `Comece a economizar por ${m.topCategory.name}: reduzir 10% ali já faz diferença no mês.`,
    })
  }

  const late = m.goalsLate.find((g) => g.monthly === null) ?? null
  if (late) {
    out.push({
      id: 'goals',
      sev: 'warn',
      weight: 30,
      title: `Meta "${late.name}" passou do prazo`,
      detail: `Ainda faltam ${brl(late.missing)}.`,
      action: `Defina um novo prazo realista para "${late.name}" ou faça um aporte maior.`,
    })
  } else {
    const heavy = m.goalsLate.filter((g) => g.monthly !== null && m.surplus > 0 && g.monthly! > m.surplus)[0]
    if (heavy) {
      out.push({
        id: 'goals',
        sev: 'warn',
        weight: 28,
        title: `Meta "${heavy.name}" pede mais do que sobra`,
        detail: `Para chegar no prazo seria preciso guardar ${brl(heavy.monthly!)} por mês, e a sobra média é ${brl(m.surplus)}.`,
        action: `Estique o prazo de "${heavy.name}" ou reduza gastos para liberar ${brl(heavy.monthly! - m.surplus)} por mês.`,
      })
    }
  }

  if (m.lentOverdue > 0) {
    out.push({
      id: 'loans',
      sev: 'warn',
      weight: 25,
      title: `${m.lentOverdue} ${m.lentOverdue === 1 ? 'pessoa passou' : 'pessoas passaram'} do prazo para te pagar`,
      detail: 'Dinheiro emprestado parado é dinheiro que não está trabalhando para você.',
      action: 'Combine uma data de pagamento e registre o recebimento em Empréstimos.',
    })
  }

  if (m.overdueCount === 0) {
    out.push({ id: 'clean', sev: 'ok', weight: 8, title: 'Nada atrasado', detail: 'Todas as contas estão em dia.' })
  }
  return out.sort((a, b) => b.weight - a.weight)
}

function score(fs: Finding[]) {
  const raw = 100 - sum(fs.filter((f) => f.sev === 'alert'), () => 18) - sum(fs.filter((f) => f.sev === 'warn'), () => 7)
  return Math.max(0, Math.min(100, raw))
}

const verdict = (s: number) => (s >= 85 ? 'excelente' : s >= 70 ? 'boa' : s >= 50 ? 'pede atenção' : 'crítica')

const NEEDS_DATA: Reply = {
  intent: 'health',
  text: 'Ainda tenho poucos lançamentos para avaliar sua situação com segurança. Registre suas receitas e despesas por alguns dias (e cadastre suas contas) e eu faço um diagnóstico completo.',
  suggestions: ['Qual meu saldo?', 'Me dê uma dica'],
}

// ---------------------------------------------------------------- respostas de consultora

export function replyHealth(ctx: AssistantContext): Reply {
  const m = computeMetrics(ctx)
  if (!m.hasData) return NEEDS_DATA
  const fs = findings(ctx, m)
  const s = score(fs)
  const problems = fs.filter((f) => f.sev !== 'ok').slice(0, 3)
  const strengths = fs.filter((f) => f.sev === 'ok').slice(0, 2)
  const first = fs.find((f) => f.sev !== 'ok' && f.action)
  return {
    intent: 'health',
    text: lines(
      `Minha leitura da sua situação: ${verdict(s)} (${s}/100).`,
      problems.length > 0 && 'O que mais me preocupa:',
      ...problems.map((p) => `• ${p.title}. ${p.detail}`),
      strengths.length > 0 && 'O que está indo bem:',
      ...strengths.map((p) => `• ${p.title}. ${p.detail}`),
      first ? `👉 Por onde começar: ${first.action}` : 'Nada pede ação urgente agora. Mantenha o ritmo e pense em fazer a reserva e as metas crescerem.',
      'A nota é um indicador meu, baseado em regras gerais de finanças pessoais, e não substitui um planejador financeiro.'
    ),
    suggestions: ['O que devo fazer agora?', 'Estou gastando demais?', 'Como está minha reserva?'],
  }
}

export function replyPlan(ctx: AssistantContext): Reply {
  const m = computeMetrics(ctx)
  if (!m.hasData) return { ...NEEDS_DATA, intent: 'plan' }
  const fs = findings(ctx, m).filter((f) => f.sev !== 'ok' && f.action)
  const steps = fs.slice(0, 4).map((f) => f.action!)
  const blocking = fs.some((f) => f.id === 'overdue' || f.id === 'forecast' || f.id === 'cash7')
  if (!blocking && m.surplus > 0 && m.emergencyMonths !== null && m.emergencyMonths < 6 && steps.length < 4) {
    const half = Math.round(m.surplus / 2)
    const target = m.avgExpense * 3
    const need = Math.max(0, target - Math.max(0, m.liquid))
    const eta = half > 0 && need > 0 ? Math.ceil(need / half) : 0
    steps.push(
      need > 0
        ? `Separe ${brl(half)} por mês (metade da sua sobra média) para a reserva: em ${eta} ${eta === 1 ? 'mês' : 'meses'} você chega a 3 meses de gastos (${brl(target)}).`
        : `Sua reserva de 3 meses já está formada. Direcione a sobra de ${brl(m.surplus)} por mês para metas ou investimentos de acordo com o seu perfil.`
    )
  }
  if (steps.length === 0) {
    return {
      intent: 'plan',
      text: 'Olhei tudo e não vejo ponto crítico agora: sem atrasos, saldo previsto positivo e gastos sob controle. O próximo passo é fazer a sobra render: reserva de emergência (3 a 6 meses de gastos) e depois suas metas.',
      suggestions: ['Como está minha reserva?', 'Como estão minhas metas?', 'Me dê uma dica'],
    }
  }
  return {
    intent: 'plan',
    text: lines('Meu plano, na ordem do que mais importa agora:', ...steps.map((t, i) => `${i + 1}. ${t}`), 'Resolva um passo por vez; o primeiro é o que mais protege seu bolso.'),
    suggestions: ['Como está minha saúde financeira?', 'O que vence essa semana?', 'Vou ficar no vermelho?'],
  }
}

export function replyReserve(ctx: AssistantContext): Reply {
  const m = computeMetrics(ctx)
  if (m.avgExpense <= 0) return { ...NEEDS_DATA, intent: 'reserve' }
  const min = m.avgExpense * 3
  const max = m.avgExpense * 6
  const have = Math.max(0, m.liquid)
  const months = have / m.avgExpense
  const gap = Math.max(0, min - have)
  const half = m.surplus > 0 ? Math.round(m.surplus / 2) : 0
  const eta = gap > 0 && half > 0 ? Math.ceil(gap / half) : 0
  const goal = ctx.goals.find((g) => !g.archived && /reserva|emergenc/i.test(g.name))
  return {
    intent: 'reserve',
    text: lines(
      `Seu gasto médio é ${brl(m.avgExpense)} por mês. A reserva de emergência ideal fica entre ${brl(min)} (3 meses) e ${brl(max)} (6 meses).`,
      `Hoje o saldo das suas contas cobre ${months.toFixed(1).replace('.', ',')} ${months >= 1.95 ? 'meses' : 'mês'} de gastos${goal ? `, e a meta "${goal.name}" tem ${brl(goal.accumulated_cents)} guardados` : ''}.`,
      gap === 0
        ? '✅ Você já passou do mínimo recomendado.'
        : half > 0
          ? `Para chegar nos 3 meses faltam ${brl(gap)}. Guardando ${brl(half)} por mês (metade da sua sobra média), leva cerca de ${eta} ${eta === 1 ? 'mês' : 'meses'}.`
          : `Faltam ${brl(gap)} para os 3 meses, mas hoje não sobra dinheiro no fim do mês. O primeiro passo é abrir folga nos gastos.`,
      'Dica: deixe a reserva separada da conta do dia a dia (uma meta aqui no app) para não gastar sem querer.'
    ),
    suggestions: ['O que devo fazer agora?', 'Qual minha taxa de economia?', 'Como estão minhas metas?'],
  }
}

export function replyOverspend(ctx: AssistantContext): Reply {
  const m = computeMetrics(ctx)
  const inc = m.curIncome > 0 ? m.curIncome : m.avgIncome
  if (m.curExpense === 0 && m.avgExpense === 0) return { ...NEEDS_DATA, intent: 'overspend' }
  if (inc <= 0) {
    return {
      intent: 'overspend',
      text: `Você gastou ${brl(m.curExpense)} neste mês, mas não encontrei receitas para comparar. Lance seus ganhos e eu digo se está gastando demais.`,
      suggestions: ['Onde mais gasto?', 'Me dê uma dica'],
    }
  }
  const ratio = (m.curExpense / inc) * 100
  const avgRatio = m.avgIncome > 0 ? (m.avgExpense / m.avgIncome) * 100 : null
  const fs = findings(ctx, m)
  const extra = fs.find((f) => f.id === 'riser' || f.id === 'concentration')
  return {
    intent: 'overspend',
    text: lines(
      `Neste mês você gastou ${brl(m.curExpense)} de ${brl(inc)} de renda: ${pct(ratio)}.`,
      avgRatio !== null && `Nos últimos meses a média foi ${pct(avgRatio)}.`,
      ratio > 100
        ? '⚠️ Sim, está gastando mais do que ganha. A diferença sai da sua reserva ou vira dívida.'
        : ratio > 80
          ? 'Está no limite: a regra 50/30/20 sugere gastar até 80% da renda e guardar 20%.'
          : '✅ Está dentro do saudável (até 80% da renda em gastos).',
      extra && `Onde olhar primeiro: ${extra.title}. ${extra.detail}`
    ),
    suggestions: ['O que devo fazer agora?', 'Onde mais gasto?', 'Compare com o mês passado'],
  }
}

export function replyPayOrSave(ctx: AssistantContext): Reply {
  const m = computeMetrics(ctx)
  const out: string[] = []
  if (m.overdueCount > 0) {
    out.push(`1. Primeiro quite o que está atrasado (${brl(m.overdueCents)}): é a "aplicação" mais rentável, porque evita multa e juros.`)
  }
  if (m.openInvoicesCents > 0) {
    out.push(
      `${out.length + 1}. Fatura de cartão em aberto (${brl(m.openInvoicesCents)}): pague o total no vencimento. Juros do rotativo costumam ser muito maiores do que qualquer rendimento.`
    )
  }
  if (m.emergencyMonths !== null && m.emergencyMonths < 1) {
    out.push(`${out.length + 1}. Em paralelo, monte um mini colchão de 1 mês de gastos (${brl(m.avgExpense)}), para não voltar a se endividar com um imprevisto.`)
  } else if (m.emergencyMonths !== null && m.emergencyMonths < 3) {
    out.push(`${out.length + 1}. Depois, complete a reserva até 3 meses de gastos (${brl(m.avgExpense * 3)}).`)
  } else {
    out.push(`${out.length + 1}. Com as dívidas em dia e a reserva formada, aí sim faz sentido investir ou apressar suas metas.`)
  }
  if (m.borrowedCents > 0) out.push(`Lembrete: você deve ${brl(m.borrowedCents)} em empréstimos pessoais; combine prazo e registre os pagamentos.`)
  return {
    intent: 'pay_or_save',
    text: lines('Minha ordem de prioridade, do que mais para o que menos urgente:', ...out, 'Isso é educação financeira geral, não recomendação de investimento.'),
    suggestions: ['O que devo fazer agora?', 'Como está minha reserva?', 'Qual minha fatura?'],
  }
}

/** Quanto guardar por mês (ou em quanto tempo) para juntar um valor. */
export function replyGoalPlan(ctx: AssistantContext, raw: string): Reply {
  const m = computeMetrics(ctx)
  const text = raw.toLowerCase()
  const monthsMatch = text.match(/(\d{1,3})\s*(anos?|meses|mes)\b/)
  const months = monthsMatch ? (monthsMatch[2].startsWith('ano') ? Number(monthsMatch[1]) * 12 : Number(monthsMatch[1])) : null
  const cleaned = text.replace(/\d{1,3}\s*(anos?|meses|mes)\b/g, ' ')
  const amounts = [...cleaned.matchAll(/(\d+(?:[.,]\d+)?)\s*(mil|k)\b|(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/g)]
    .map((a) => {
      if (a[2]) return Math.round(Number(a[1].replace(',', '.')) * 1000 * 100)
      const n = Number(a[3].replace(/\./g, ''))
      return n * 100 + Number(((a[4] ?? '') + '00').slice(0, 2))
    })
    .filter((c) => c >= 2000)
  const target = amounts[0] ?? null
  const perMonth = amounts[1] ?? null
  const sug = ['Como está minha reserva?', 'O que devo fazer agora?', 'Qual minha taxa de economia?']

  if (target && months) {
    const need = Math.ceil(target / months)
    const room = m.surplus
    return {
      intent: 'goal_plan',
      text: lines(
        `Para juntar ${brl(target)} em ${months} ${months === 1 ? 'mês' : 'meses'}, você precisa guardar ${brl(need)} por mês (sem contar rendimentos).`,
        m.avgIncome > 0 && room > 0
          ? need <= room
            ? `✅ Cabe: sua sobra média é ${brl(room)} por mês, então sobra ${brl(room - need)} de folga.`
            : `⚠️ Aperta: sua sobra média é ${brl(room)} por mês. Faltam ${brl(need - room)} por mês; ou você estica o prazo (com ${brl(room)} por mês leva ${Math.ceil(target / room)} meses) ou corta gastos.`
          : m.avgIncome > 0
            ? `⚠️ Hoje não sobra dinheiro no fim do mês, então esse plano só fecha se você cortar cerca de ${brl(need + Math.abs(room))} por mês dos gastos.`
            : 'Lance suas receitas para eu dizer se esse valor cabe no seu mês.',
        'Dica: crie uma meta em Reservas e metas com esse valor e prazo, e eu acompanho o progresso.'
      ),
      suggestions: sug,
    }
  }
  if (target && perMonth) {
    const n = Math.ceil(target / perMonth)
    return {
      intent: 'goal_plan',
      text: lines(
        `Guardando ${brl(perMonth)} por mês, você junta ${brl(target)} em cerca de ${n} ${n === 1 ? 'mês' : 'meses'}${n >= 24 ? ` (${(n / 12).toFixed(1).replace('.', ',')} anos)` : ''}, sem contar rendimentos.`,
        m.avgIncome > 0 && m.surplus > 0 && perMonth > m.surplus ? `Atenção: isso é mais do que a sua sobra média (${brl(m.surplus)}).` : null
      ),
      suggestions: sug,
    }
  }
  if (target) {
    const room = m.surplus
    return {
      intent: 'goal_plan',
      text: lines(
        `Para ${brl(target)}, o prazo define a parcela. Alguns cenários:`,
        ...[6, 12, 24].map((n) => `• ${n} meses: ${brl(Math.ceil(target / n))} por mês`),
        room > 0 ? `Sua sobra média é ${brl(room)} por mês, então em ${Math.ceil(target / room)} meses você chega lá guardando tudo o que sobra.` : null,
        'Me diga em quantos meses quer juntar (ex.: "juntar 10 mil em 12 meses") que eu confirmo se cabe.'
      ),
      suggestions: sug,
    }
  }
  return {
    intent: 'goal_plan',
    text: 'Me diga o valor e, se quiser, o prazo. Por exemplo: "quanto guardar por mês para juntar 10 mil em 12 meses?" ou "em quanto tempo junto 5 mil guardando 300 por mês?".',
    suggestions: sug,
  }
}

/** Linhas extras para "posso comprar X em N vezes": mostra o peso das parcelas na renda. */
export function installmentNote(ctx: AssistantContext, amountCents: number, n: number): string[] {
  const m = computeMetrics(ctx)
  const parcel = Math.ceil(amountCents / n)
  const out = [`Parcelado em ${n}x, cada parcela fica em ${brl(parcel)}.`]
  if (m.avgIncome > 0) {
    const after = (m.installmentMonthly + parcel) / m.avgIncome
    out.push(`Com ela, suas parcelas passariam a ${pct(after * 100)} da renda (hoje ${pct((m.installmentMonthly / m.avgIncome) * 100)}); a regra geral é ficar abaixo de 30%.`)
    if (after > 0.3) out.push('⚠️ Eu esperaria: o orçamento fica apertado por vários meses. Se puder, junte parte do valor e parcele menos.')
  }
  out.push('Confirme se há juros: parcelado sem juros costuma valer a pena só se você não tiver desconto à vista maior do que o rendimento do dinheiro.')
  return out
}

// ---------------------------------------------------------------- "minha leitura" nas respostas comuns

const RELEVANT: Record<string, string[]> = {
  balance: ['overdue', 'cash7', 'forecast', 'reserve'],
  summary: ['overdue', 'forecast', 'savings', 'card', 'reserve'],
  forecast: ['forecast', 'cash7', 'overdue'],
  savings: ['savings', 'install', 'concentration'],
  card: ['card', 'overdue', 'install'],
  due: ['overdue', 'cash7', 'forecast'],
  expenses: ['budget', 'riser', 'concentration', 'savings'],
  top_expenses: ['concentration', 'riser', 'budget', 'savings'],
  income: ['savings', 'reserve'],
  goals: ['goals', 'reserve', 'savings'],
  budget: ['budget', 'riser', 'concentration'],
  loans: ['loans', 'overdue'],
}

/** Um comentário curto de consultora ao fim de respostas comuns; só aparece quando há algo relevante (aviso ou alerta). */
export function adviceFor(intent: string, ctx: AssistantContext): string | null {
  const ids = RELEVANT[intent]
  if (!ids) return null
  const m = computeMetrics(ctx)
  if (!m.hasData) return null
  const pick = findings(ctx, m).find((f) => f.sev !== 'ok' && f.action && ids.includes(f.id))
  if (!pick) return null
  return `💡 Minha leitura: ${pick.title}. ${pick.detail} ${pick.action}`
}
