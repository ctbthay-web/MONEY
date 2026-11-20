// Cérebro da assistente: recebe a pergunta + os dados do próprio usuário e responde com cálculos REAIS.
// Sem IA generativa e sem custo: nada é inventado — toda frase vem de um número que o sistema calculou.
import { formatCentsToBRL as brl, formatDate } from '../format'
import { groupTransactionsByInvoice, invoicePeriodLabel, transactionDueDate } from '../invoices'
import { computeForecast } from '../forecast'
import { adviceFor, installmentNote, replyGoalPlan, replyHealth, replyOverspend, replyPayOrSave, replyPlan, replyReserve } from './advisor'
import { totalLiquidBalanceCents } from '../accountTypes'
import {
  addDaysISO,
  detectIntent,
  fixTypos,
  normalize,
  parseAmountCents,
  parsePeriod,
  stripPeriod,
  topicWords,
  type Intent,
  type Period,
} from './nlu'
import type { Account, Category, Goal, Loan, LoanPayment, TransactionWithRelations } from '../../types/database'

export interface AssistantContext {
  name: string
  today: string
  accounts: Account[]
  transactions: TransactionWithRelations[]
  transfers: { to_account_id: string; invoice_period: string | null }[]
  goals: Goal[]
  loans: Loan[]
  loanPayments: LoanPayment[]
  budgets: { id: string; category_id: string; amount_cents: number }[]
  categories: Category[]
}

export interface Reply {
  text: string
  suggestions: string[]
  intent: Intent
  /** pergunta já interpretada (com correções), usada como contexto de uma próxima pergunta curta */
  asked?: string
}

/** O que a conversa lembra da última pergunta, para entender "e no mês passado?". */
export interface Memory {
  question: string
  intent: Intent
}

const MENU = [
  'Como está meu mês?',
  'Qual meu saldo?',
  'O que vence essa semana?',
  'Vou ficar no vermelho?',
  'Como está minha saúde financeira?',
  'O que devo fazer agora?',
]

const pct = (n: number) => `${Math.round(n)}%`
const lines = (...l: (string | null | false | undefined)[]) => l.filter((x): x is string => Boolean(x)).join('\n')
const monthEnd = (today: string) => {
  const [y, m] = today.split('-').map(Number)
  const d = new Date(y, m, 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const norm = normalize
const wordIn = (hay: string, needle: string) => needle.length >= 3 && new RegExp(`(^| )${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(hay)
const singular = (w: string) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w)

function findCategory(q: string, cats: Category[]): Category | null {
  let best: Category | null = null
  let bestLen = 0
  for (const c of cats) {
    const n = norm(c.name)
    if ((wordIn(q, n) || wordIn(q, singular(n))) && n.length > bestLen) {
      best = c
      bestLen = n.length
    }
  }
  return best
}

function findAccount(q: string, accounts: Account[]): Account | null {
  let best: Account | null = null
  let bestLen = 0
  for (const a of accounts) {
    const n = norm(a.name)
    if (wordIn(q, n) && n.length > bestLen) {
      best = a
      bestLen = n.length
    }
  }
  return best
}

const pendingOf = (loan: Loan, paid: Map<string, number>) => Math.max(0, loan.principal_cents - (paid.get(loan.id) ?? 0))

function sumBy<T>(rows: T[], f: (r: T) => number) {
  return rows.reduce((s, r) => s + f(r), 0)
}

function unpaidInvoices(ctx: AssistantContext) {
  const out: { card: Account; period: string; dueDate: string; totalCents: number }[] = []
  for (const card of ctx.accounts.filter((a) => a.type === 'credit_card' && !a.archived)) {
    const cardTx = ctx.transactions.filter((t) => t.account_id === card.id)
    for (const g of groupTransactionsByInvoice(cardTx, card)) {
      if (!g.dueDate || g.totalCents <= 0) continue
      if (ctx.transfers.some((t) => t.to_account_id === card.id && t.invoice_period === g.period)) continue
      out.push({ card, period: g.period, dueDate: g.dueDate, totalCents: g.totalCents })
    }
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

function openBills(ctx: AssistantContext, type: 'expense' | 'income') {
  return ctx.transactions
    .filter((t) => t.type === type && !t.applied_to_balance && t.account?.type !== 'credit_card')
    .map((t) => ({ t, due: transactionDueDate(t, t.account) }))
    .sort((a, b) => a.due.localeCompare(b.due))
}

// ---------------------------------------------------------------- respostas

function replyHelp(ctx: AssistantContext): Reply {
  return {
    intent: 'help',
    text: lines(
      `Oi! Sou a ${ctx.name}. Respondo com os números reais das suas finanças. Você pode me perguntar, por exemplo:`,
      '• "Quanto gastei com mercado esse mês?"',
      '• "Qual meu saldo?" e "Como está meu mês?"',
      '• "O que vence essa semana?" e "Qual minha fatura?"',
      '• "Vou ficar no vermelho?" (previsão até o fim do mês)',
      '• "Estourei algum orçamento?", "Como estão minhas metas?"',
      '• "Quem me deve?" e "Me dê uma dica"',
      '• "Como está minha saúde financeira?" e "O que devo fazer agora?"',
      '• "Posso comprar um celular de R$ 2.000 em 10x?" e "Quanto guardar por mês para juntar 10 mil em 12 meses?"'
    ),
    suggestions: MENU,
  }
}

function replyBalance(ctx: AssistantContext): Reply {
  const accs = ctx.accounts.filter((a) => !a.archived && a.type !== 'credit_card')
  const total = totalLiquidBalanceCents(ctx.accounts.filter((a) => !a.archived))
  if (accs.length === 0) {
    return { intent: 'balance', text: 'Você ainda não tem contas cadastradas. Cadastre uma em Contas e cartões e eu mostro seu saldo.', suggestions: MENU }
  }
  const list = [...accs].sort((a, b) => b.balance_cents - a.balance_cents).slice(0, 6)
  const invoices = unpaidInvoices(ctx)
  const cardTotal = sumBy(invoices, (i) => i.totalCents)
  return {
    intent: 'balance',
    text: lines(
      `Seu saldo total é ${brl(total)}.`,
      ...list.map((a) => `• ${a.name}: ${brl(a.balance_cents)}`),
      cardTotal > 0 && `Cartões não entram no saldo. Você tem ${brl(cardTotal)} em faturas ainda não pagas.`
    ),
    suggestions: ['Como está meu mês?', 'Vou ficar no vermelho?', 'Qual minha fatura?'],
  }
}

interface Filters {
  type: 'expense' | 'income'
  category?: Category | null
  account?: Account | null
  word?: string | null
}

function filterTx(ctx: AssistantContext, f: Filters, from: string, to: string) {
  return ctx.transactions.filter((t) => {
    if (t.type !== f.type || t.date < from || t.date > to) return false
    if (f.category && t.category_id !== f.category.id) return false
    if (f.account && t.account_id !== f.account.id) return false
    if (f.word && !norm(t.description).includes(f.word)) return false
    return true
  })
}

function topCategories(rows: TransactionWithRelations[], n: number) {
  const map = new Map<string, { name: string; cents: number }>()
  for (const t of rows) {
    const id = t.category?.id ?? 'none'
    const cur = map.get(id)
    map.set(id, { name: t.category?.name ?? 'Sem categoria', cents: (cur?.cents ?? 0) + t.amount_cents })
  }
  return [...map.values()].sort((a, b) => b.cents - a.cents).slice(0, n)
}

function replyMoney(ctx: AssistantContext, q: string, period: Period, type: 'expense' | 'income'): Reply {
  const verb = type === 'expense' ? 'gastou' : 'recebeu'
  const noun = type === 'expense' ? 'gastos' : 'receitas'
  const category = findCategory(q, ctx.categories)
  const account = findAccount(q, ctx.accounts)

  // sem categoria/conta citada: procura uma palavra da pergunta nas descrições (ex.: "uber", "ifood")
  let word: string | null = null
  if (!category && !account) {
    const candidates = topicWords(q)
    let bestCount = 0
    for (const w of candidates) {
      const c = ctx.transactions.filter((t) => t.type === type && norm(t.description).includes(w)).length
      if (c > bestCount) {
        bestCount = c
        word = w
      }
    }
    if (!word && candidates.length > 0) {
      return {
        intent: type === 'expense' ? 'expenses' : 'income',
        text: `Não encontrei ${noun} relacionados a "${candidates[0]}". Tente o nome de uma categoria ou conta, ou pergunte só "quanto ${type === 'expense' ? 'gastei' : 'recebi'} ${period.label}".`,
        suggestions: ['Onde mais gasto?', 'Como está meu mês?'],
      }
    }
  }

  const f: Filters = { type, category, account, word }
  const rows = filterTx(ctx, f, period.from, period.to)
  const total = sumBy(rows, (t) => t.amount_cents)
  const what = category ? ` em ${category.name}` : account ? ` na conta ${account.name}` : word ? ` com "${word}"` : ''

  if (rows.length === 0) {
    return {
      intent: type === 'expense' ? 'expenses' : 'income',
      text: `Não encontrei ${noun}${what} ${period.label}.`,
      suggestions: ['Como está meu mês?', 'Onde mais gasto?'],
    }
  }

  let compare: string | null = null
  if (period.previous) {
    const prev = sumBy(filterTx(ctx, f, period.previous.from, period.previous.to), (t) => t.amount_cents)
    if (prev > 0) {
      const diff = total - prev
      const p = Math.abs(diff / prev) * 100
      compare = `Em relação a ${period.previous.label} (${brl(prev)}): ${diff === 0 ? 'igual' : diff > 0 ? `${pct(p)} a mais` : `${pct(p)} a menos`}.`
    }
  }

  const tops = !category && !account && !word && type === 'expense' ? topCategories(rows, 3) : []
  return {
    intent: type === 'expense' ? 'expenses' : 'income',
    text: lines(
      `Você ${verb} ${brl(total)}${what} ${period.label} (${rows.length} ${rows.length === 1 ? 'lançamento' : 'lançamentos'}).`,
      compare,
      tops.length > 0 && 'Onde mais pesou:',
      ...tops.map((c) => `• ${c.name}: ${brl(c.cents)} (${pct((c.cents / total) * 100)})`)
    ),
    suggestions: type === 'expense' ? ['Onde mais gasto?', 'Estourei algum orçamento?', 'Me dê uma dica'] : ['Como está meu mês?', 'Qual minha taxa de economia?'],
  }
}

function replyTopExpenses(ctx: AssistantContext, period: Period): Reply {
  const rows = filterTx(ctx, { type: 'expense' }, period.from, period.to)
  if (rows.length === 0) {
    return { intent: 'top_expenses', text: `Não encontrei gastos ${period.label}.`, suggestions: MENU }
  }
  const total = sumBy(rows, (t) => t.amount_cents)
  const tops = topCategories(rows, 5)
  return {
    intent: 'top_expenses',
    text: lines(
      `Seus maiores gastos ${period.label} somam ${brl(total)}:`,
      ...tops.map((c, i) => `${i + 1}. ${c.name}: ${brl(c.cents)} (${pct((c.cents / total) * 100)})`)
    ),
    suggestions: ['Me dê uma dica', 'Estourei algum orçamento?', 'Como está meu mês?'],
  }
}

function replyDue(ctx: AssistantContext, period: Period, kind: 'expense' | 'income'): Reply {
  const today = ctx.today
  const horizon = period.isDefault ? addDaysISO(today, 30) : period.to
  const floor = period.isDefault ? '0000-01-01' : period.from
  const bills = openBills(ctx, kind).filter((b) => b.due >= floor && b.due <= horizon)
  const overdue = bills.filter((b) => b.due < today)
  const upcoming = bills.filter((b) => b.due >= today)
  const invoices = kind === 'expense' ? unpaidInvoices(ctx).filter((i) => i.dueDate >= floor && i.dueDate <= horizon) : []
  const invOverdue = invoices.filter((i) => i.dueDate < today)
  const invUpcoming = invoices.filter((i) => i.dueDate >= today)
  const scope = period.isDefault ? 'nos próximos 30 dias' : period.label

  if (bills.length === 0 && invoices.length === 0) {
    return {
      intent: kind === 'expense' ? 'due' : 'receivable',
      text: kind === 'expense' ? `Nada em aberto para pagar ${scope}. 🎉` : `Não há recebimentos em aberto ${scope}.`,
      suggestions: ['Como está meu mês?', 'Vou ficar no vermelho?'],
    }
  }

  const line = (b: { t: TransactionWithRelations; due: string }) => `• ${formatDate(b.due)} — ${b.t.description}: ${brl(b.t.amount_cents)}`
  const invLine = (i: { card: Account; dueDate: string; totalCents: number }) => `• ${formatDate(i.dueDate)} — Fatura ${i.card.name}: ${brl(i.totalCents)}`
  const od = overdue.length + invOverdue.length
  const odTotal = sumBy(overdue, (b) => b.t.amount_cents) + sumBy(invOverdue, (i) => i.totalCents)
  const upTotal = sumBy(upcoming, (b) => b.t.amount_cents) + sumBy(invUpcoming, (i) => i.totalCents)
  const upCount = upcoming.length + invUpcoming.length

  return {
    intent: kind === 'expense' ? 'due' : 'receivable',
    text: lines(
      od > 0 && `⚠️ Atrasado${od > 1 ? 's' : ''} (${od}): ${brl(odTotal)}`,
      ...overdue.slice(0, 4).map(line),
      ...invOverdue.slice(0, 2).map(invLine),
      upCount > 0 && `${kind === 'expense' ? 'A pagar' : 'A receber'} ${scope} (${upCount}): ${brl(upTotal)}`,
      ...[...upcoming.slice(0, 5).map((b) => ({ d: b.due, s: line(b) })), ...invUpcoming.slice(0, 2).map((i) => ({ d: i.dueDate, s: invLine(i) }))]
        .sort((a, b) => a.d.localeCompare(b.d))
        .slice(0, 6)
        .map((x) => x.s),
      bills.length + invoices.length > 8 && 'E mais alguns itens. Veja a lista completa em Movimentações.'
    ),
    suggestions: ['Vou ficar no vermelho?', 'Qual minha fatura?', 'Qual meu saldo?'],
  }
}

function replyCard(ctx: AssistantContext, q: string): Reply {
  const cards = ctx.accounts.filter((a) => a.type === 'credit_card' && !a.archived)
  if (cards.length === 0) {
    return { intent: 'card', text: 'Você ainda não cadastrou cartão de crédito. Cadastre em Contas e cartões para eu acompanhar suas faturas.', suggestions: MENU }
  }
  const only = findAccount(q, cards)
  const target = only ? [only] : cards
  const invoices = unpaidInvoices(ctx).filter((i) => target.some((c) => c.id === i.card.id))
  if (invoices.length === 0) {
    return { intent: 'card', text: `Nenhuma fatura em aberto${only ? ` no ${only.name}` : ''}. 🎉`, suggestions: MENU }
  }
  const out: string[] = []
  for (const c of target) {
    const mine = invoices.filter((i) => i.card.id === c.id)
    if (mine.length === 0) continue
    out.push(`${c.name}:`)
    for (const i of mine.slice(0, 3)) {
      const late = i.dueDate < ctx.today
      out.push(`• ${late ? '⚠️ vencida em' : 'vence em'} ${formatDate(i.dueDate)}: ${brl(i.totalCents)}`)
    }
    if (c.credit_limit_cents) {
      const used = sumBy(mine, (i) => i.totalCents)
      out.push(`• Em aberto ${brl(used)} de ${brl(c.credit_limit_cents)} de limite (${pct((used / c.credit_limit_cents) * 100)})`)
    }
  }
  return { intent: 'card', text: lines(...out), suggestions: ['O que vence essa semana?', 'Vou ficar no vermelho?', 'Qual meu saldo?'] }
}

function replyForecast(ctx: AssistantContext): Reply {
  const end = monthEnd(ctx.today)
  const f = computeForecast(ctx.accounts, ctx.transactions, ctx.transfers, ctx.today, end)
  if (ctx.accounts.filter((a) => !a.archived && a.type !== 'credit_card').length === 0) {
    return { intent: 'forecast', text: 'Cadastre uma conta para eu prever seu saldo até o fim do mês.', suggestions: MENU }
  }
  return {
    intent: 'forecast',
    text: lines(
      `Hoje você tem ${brl(f.startCents)}. Considerando o que ainda está em aberto, o saldo previsto para ${formatDate(end)} é ${brl(f.endCents)}.`,
      f.firstNegativeDate
        ? `⚠️ Atenção: o saldo fica negativo a partir de ${formatDate(f.firstNegativeDate)}. O ponto mais baixo é ${brl(f.minCents)} em ${formatDate(f.minDate)}.`
        : `Seu saldo não fica negativo neste mês. O ponto mais baixo é ${brl(f.minCents)} em ${formatDate(f.minDate)}.`,
      'Conta contas e faturas em aberto pelo vencimento (as vencidas entram hoje).'
    ),
    suggestions: ['O que vence essa semana?', 'Qual minha fatura?', 'Me dê uma dica'],
  }
}

function spentByCategory(ctx: AssistantContext, from: string, to: string) {
  const m = new Map<string, number>()
  for (const t of ctx.transactions) {
    if (t.type !== 'expense' || t.date < from || t.date > to || !t.category_id) continue
    m.set(t.category_id, (m.get(t.category_id) ?? 0) + t.amount_cents)
  }
  return m
}

function replyBudget(ctx: AssistantContext): Reply {
  if (ctx.budgets.length === 0) {
    return {
      intent: 'budget',
      text: 'Você ainda não definiu orçamentos. Em Planejamento você escolhe quanto quer gastar por categoria e eu aviso ao chegar em 80%.',
      suggestions: ['Onde mais gasto?', 'Me dê uma dica'],
    }
  }
  const month = ctx.today.slice(0, 7)
  const spent = spentByCategory(ctx, `${month}-01`, `${month}-31`)
  const names = new Map(ctx.categories.map((c) => [c.id, c.name]))
  const items = ctx.budgets
    .map((b) => ({ name: names.get(b.category_id) ?? 'Categoria', used: spent.get(b.category_id) ?? 0, limit: b.amount_cents }))
    .sort((a, b) => b.used / b.limit - a.used / a.limit)
  const over = items.filter((i) => i.used > i.limit)
  const near = items.filter((i) => i.used <= i.limit && i.used / i.limit >= 0.8)
  return {
    intent: 'budget',
    text: lines(
      over.length > 0 ? `⚠️ Você estourou ${over.length} ${over.length === 1 ? 'orçamento' : 'orçamentos'} neste mês.` : near.length > 0 ? 'Nenhum orçamento estourou, mas atenção aos que estão perto do limite.' : 'Tudo dentro do orçamento neste mês. 👏',
      ...items.slice(0, 6).map((i) => `• ${i.name}: ${brl(i.used)} de ${brl(i.limit)} (${pct((i.used / i.limit) * 100)})${i.used > i.limit ? ` — estourou ${brl(i.used - i.limit)}` : ''}`)
    ),
    suggestions: ['Onde mais gasto?', 'Me dê uma dica', 'Vou ficar no vermelho?'],
  }
}

function replyGoals(ctx: AssistantContext): Reply {
  const goals = ctx.goals.filter((g) => !g.archived)
  if (goals.length === 0) {
    return { intent: 'goals', text: 'Você ainda não tem metas ou reservas. Crie uma em Reservas e metas e eu acompanho o progresso.', suggestions: MENU }
  }
  const out = goals.slice(0, 5).map((g) => {
    const p = g.target_cents > 0 ? (g.accumulated_cents / g.target_cents) * 100 : 0
    let extra = ''
    if (g.deadline && g.accumulated_cents < g.target_cents) {
      const [y, m] = ctx.today.split('-').map(Number)
      const [dy, dm] = g.deadline.split('-').map(Number)
      const months = (dy - y) * 12 + (dm - m)
      extra = months > 0 ? ` — para chegar até ${formatDate(g.deadline)}, guarde ${brl(Math.ceil((g.target_cents - g.accumulated_cents) / months))} por mês` : ` — prazo em ${formatDate(g.deadline)}`
    }
    return `• ${g.name}: ${brl(g.accumulated_cents)} de ${brl(g.target_cents)} (${pct(p)})${extra}`
  })
  return {
    intent: 'goals',
    text: lines(`Você tem ${goals.length} ${goals.length === 1 ? 'meta ativa' : 'metas ativas'}, com ${brl(sumBy(goals, (g) => g.accumulated_cents))} guardados:`, ...out),
    suggestions: ['Qual minha taxa de economia?', 'Como está meu mês?', 'Me dê uma dica'],
  }
}

function replyLoans(ctx: AssistantContext, q: string): Reply {
  const paid = new Map<string, number>()
  for (const p of ctx.loanPayments) paid.set(p.loan_id, (paid.get(p.loan_id) ?? 0) + p.amount_cents)
  const open = ctx.loans.filter((l) => !l.archived && pendingOf(l, paid) > 0)
  if (open.length === 0) {
    return { intent: 'loans', text: 'Você não tem empréstimos em aberto.', suggestions: MENU }
  }
  const person = (() => {
    for (const l of open) if (wordIn(q, norm(l.counterparty))) return l.counterparty
    return null
  })()
  const scope = person ? open.filter((l) => l.counterparty === person) : open
  const group = (dir: 'lent' | 'borrowed') => {
    const m = new Map<string, number>()
    for (const l of scope.filter((x) => x.direction === dir)) m.set(l.counterparty, (m.get(l.counterparty) ?? 0) + pendingOf(l, paid))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }
  const lent = group('lent')
  const borrowed = group('borrowed')
  const overdue = scope.filter((l) => l.due_date && l.due_date < ctx.today)
  return {
    intent: 'loans',
    text: lines(
      lent.length > 0 && `Te devem ${brl(sumBy(lent, (x) => x[1]))}:`,
      ...lent.slice(0, 4).map(([n, c]) => `• ${n}: ${brl(c)}`),
      borrowed.length > 0 && `Você deve ${brl(sumBy(borrowed, (x) => x[1]))}:`,
      ...borrowed.slice(0, 4).map(([n, c]) => `• ${n}: ${brl(c)}`),
      overdue.length > 0 && `⚠️ ${overdue.length} ${overdue.length === 1 ? 'empréstimo passou' : 'empréstimos passaram'} do prazo combinado.`
    ),
    suggestions: ['Como está meu mês?', 'Qual meu saldo?'],
  }
}

function monthTotals(ctx: AssistantContext, period: Period) {
  const inc = sumBy(filterTx(ctx, { type: 'income' }, period.from, period.to), (t) => t.amount_cents)
  const exp = sumBy(filterTx(ctx, { type: 'expense' }, period.from, period.to), (t) => t.amount_cents)
  return { inc, exp }
}

function replySavings(ctx: AssistantContext, period: Period): Reply {
  const { inc, exp } = monthTotals(ctx, period)
  if (inc <= 0) {
    return {
      intent: 'savings',
      text: exp > 0 ? `Não encontrei receitas ${period.label}, então não dá para calcular a taxa de economia. Os gastos foram ${brl(exp)}.` : `Não encontrei movimentações ${period.label}.`,
      suggestions: ['Como está meu mês?', 'Onde mais gasto?'],
    }
  }
  const rate = ((inc - exp) / inc) * 100
  return {
    intent: 'savings',
    text: lines(
      `${period.label.replace(/^./, (c) => c.toUpperCase())}: você recebeu ${brl(inc)} e gastou ${brl(exp)}.`,
      rate >= 0 ? `Sobraram ${brl(inc - exp)}, uma taxa de economia de ${pct(rate)}.` : `Os gastos passaram das receitas em ${brl(exp - inc)}.`,
      rate >= 20 ? 'Ótimo ritmo! 👏' : rate >= 0 ? 'Quanto mais perto de 20%, mais folga você ganha.' : 'Vale rever os maiores gastos.'
    ),
    suggestions: ['Onde mais gasto?', 'Me dê uma dica', 'Como estão minhas metas?'],
  }
}

function replySummary(ctx: AssistantContext, period: Period): Reply {
  const { inc, exp } = monthTotals(ctx, period)
  const total = totalLiquidBalanceCents(ctx.accounts.filter((a) => !a.archived))
  const soon = openBills(ctx, 'expense').filter((b) => b.due <= addDaysISO(ctx.today, 7))
  const f = computeForecast(ctx.accounts, ctx.transactions, ctx.transfers, ctx.today, monthEnd(ctx.today))
  return {
    intent: 'summary',
    text: lines(
      `Resumo ${period.label}:`,
      `• Receitas: ${brl(inc)}`,
      `• Despesas: ${brl(exp)}`,
      `• Resultado: ${brl(inc - exp)}`,
      `• Saldo atual: ${brl(total)}`,
      soon.length > 0 && `• Nos próximos 7 dias vencem ${soon.length} ${soon.length === 1 ? 'conta' : 'contas'}: ${brl(sumBy(soon, (b) => b.t.amount_cents))}`,
      f.firstNegativeDate ? `⚠️ O saldo previsto fica negativo a partir de ${formatDate(f.firstNegativeDate)}.` : `• Saldo previsto no fim do mês: ${brl(f.endCents)}`
    ),
    suggestions: ['Onde mais gasto?', 'O que vence essa semana?', 'Me dê uma dica'],
  }
}

export function buildTips(ctx: AssistantContext): string[] {
  const tips: string[] = []
  const month = ctx.today.slice(0, 7)
  const from = `${month}-01`
  const to = `${month}-31`

  const f = computeForecast(ctx.accounts, ctx.transactions, ctx.transfers, ctx.today, monthEnd(ctx.today))
  if (f.firstNegativeDate) tips.push(`Seu saldo previsto fica negativo a partir de ${formatDate(f.firstNegativeDate)}. Considere adiar gastos ou antecipar recebimentos antes dessa data.`)

  const overdue = openBills(ctx, 'expense').filter((b) => b.due < ctx.today)
  const lateInv = unpaidInvoices(ctx).filter((i) => i.dueDate < ctx.today)
  if (overdue.length + lateInv.length > 0) tips.push(`Você tem ${overdue.length + lateInv.length} ${overdue.length + lateInv.length === 1 ? 'conta atrasada' : 'contas atrasadas'} (${brl(sumBy(overdue, (b) => b.t.amount_cents) + sumBy(lateInv, (i) => i.totalCents))}). Quitar primeiro evita juros e multa.`)

  const spent = spentByCategory(ctx, from, to)
  const names = new Map(ctx.categories.map((c) => [c.id, c.name]))
  for (const b of ctx.budgets) {
    const used = spent.get(b.category_id) ?? 0
    if (used > b.amount_cents) tips.push(`${names.get(b.category_id) ?? 'Uma categoria'} passou do orçamento em ${brl(used - b.amount_cents)}. Segurar esse gasto no resto do mês ajuda.`)
  }

  for (const card of ctx.accounts.filter((a) => a.type === 'credit_card' && a.credit_limit_cents && !a.archived)) {
    const open = sumBy(unpaidInvoices(ctx).filter((i) => i.card.id === card.id), (i) => i.totalCents)
    if (open / card.credit_limit_cents! >= 0.7) tips.push(`O ${card.name} já usa ${pct((open / card.credit_limit_cents!) * 100)} do limite. Evite novas compras parceladas nele.`)
  }

  const exp = filterTx(ctx, { type: 'expense' }, from, to)
  const expTotal = sumBy(exp, (t) => t.amount_cents)
  const tops = topCategories(exp, 1)
  if (expTotal > 0 && tops[0] && tops[0].cents / expTotal >= 0.4) tips.push(`${tops[0].name} concentra ${pct((tops[0].cents / expTotal) * 100)} dos seus gastos do mês. Pequenos cortes ali rendem mais.`)

  const { inc, exp: e2 } = monthTotals(ctx, { from, to, label: '' })
  if (inc > 0 && (inc - e2) / inc < 0.1) tips.push(`Sua taxa de economia no mês está em ${pct(((inc - e2) / inc) * 100)}. Uma meta simples é separar 10% da receita assim que ela entrar.`)

  for (const g of ctx.goals.filter((x) => !x.archived && x.deadline && x.accumulated_cents < x.target_cents)) {
    const [y, m] = ctx.today.split('-').map(Number)
    const [dy, dm] = g.deadline!.split('-').map(Number)
    const months = (dy - y) * 12 + (dm - m)
    if (months <= 0) tips.push(`A meta "${g.name}" chegou ao prazo e ainda falta ${brl(g.target_cents - g.accumulated_cents)}.`)
  }
  return tips.slice(0, 4)
}

function replyTips(ctx: AssistantContext): Reply {
  const tips = buildTips(ctx)
  return {
    intent: 'tips',
    text:
      tips.length > 0
        ? lines('Olhando seus números reais, minhas sugestões:', ...tips.map((t, i) => `${i + 1}. ${t}`))
        : 'Olhei seus números e não vejo nada preocupante agora: sem atrasos, orçamento em dia e saldo previsto positivo. Continue assim! 👏',
    suggestions: ['Como está meu mês?', 'Onde mais gasto?', 'Estourei algum orçamento?'],
  }
}

// "Por que meu cartão/conta/mês não fechou?": explica o que ainda está em aberto no período e o que fecha cada coisa.
function replyExplain(ctx: AssistantContext, q: string, period: Period): Reply {
  const where = period.isDefault ? 'neste mês' : period.label
  const inPeriod = (d: string) => d >= period.from && d <= period.to
  const fromYm = period.from.slice(0, 7)
  const toYm = period.to.slice(0, 7)
  const acc = findAccount(q, ctx.accounts.filter((a) => !a.archived))
  const follow = ['O que vence essa semana?', 'Qual minha fatura?', 'Vou ficar no vermelho?']

  // --- cartão de crédito: explica a fatura do período
  if (acc && acc.type === 'credit_card') {
    const groups = groupTransactionsByInvoice(
      ctx.transactions.filter((t) => t.account_id === acc.id),
      acc
    ).filter(
      (g) =>
        (g.period >= fromYm && g.period <= toYm) ||
        (g.dueDate !== null && inPeriod(g.dueDate)) ||
        g.purchases.some((p) => inPeriod(p.date))
    )
    if (groups.length === 0) {
      return {
        intent: 'explain',
        text: `Não encontrei compras no ${acc.name} que caiam em fatura ${where}. Se você esperava ver uma fatura, confira o dia de fechamento do cartão em Contas e cartões.`,
        suggestions: follow,
      }
    }
    const out: string[] = []
    let needsPayment = false
    for (const g of groups) {
      const paid = ctx.transfers.some((t) => t.to_account_id === acc.id && t.invoice_period === g.period)
      const late = !paid && g.dueDate !== null && g.dueDate < ctx.today
      const parcelas = g.purchases.filter((p) => (p.installment_total ?? 0) > 1).length
      out.push(
        g.dueDate
          ? `Fatura do ${acc.name} que vence em ${formatDate(g.dueDate)}: ${brl(g.totalCents)}.`
          : `Fatura de ${invoicePeriodLabel(g.period)} do ${acc.name}: ${brl(g.totalCents)}.`
      )
      if (paid) {
        out.push('• Ela já está paga — esse mês fechou.')
      } else {
        needsPayment = true
        out.push(
          late
            ? '• Está VENCIDA e ainda não tem pagamento registrado, por isso não fechou.'
            : '• Ainda não tem pagamento registrado, por isso ela segue em aberto.'
        )
      }
      out.push(`• Reúne ${g.purchases.length} ${g.purchases.length === 1 ? 'compra' : 'compras'}${parcelas > 0 ? `, sendo ${parcelas} ${parcelas === 1 ? 'parcela' : 'parcelas'} de compras parceladas` : ''}.`)
    }
    if (acc.closing_day) {
      out.push(`O ciclo fecha todo dia ${acc.closing_day}: compra no dia do fechamento ou depois vai para a fatura seguinte.`)
    }
    const open = sumBy(unpaidInvoices(ctx).filter((i) => i.card.id === acc.id), (i) => i.totalCents)
    if (acc.credit_limit_cents && open > acc.credit_limit_cents) {
      out.push(`⚠️ Somando todas as faturas em aberto (${brl(open)}), você passa do limite de ${brl(acc.credit_limit_cents)} do cartão.`)
    }
    if (needsPayment) out.push('Para fechar: em Contas e cartões, abra "Ver fatura" e use "Pagar fatura" escolhendo a conta de onde sai o dinheiro.')
    return { intent: 'explain', text: lines(...out), suggestions: follow }
  }

  // --- conta comum ou visão geral: o que ficou sem confirmar no período
  const mine = ctx.transactions.filter((t) => t.account?.type !== 'credit_card' && (!acc || t.account_id === acc.id))
  const inRange = mine.filter((t) => inPeriod(transactionDueDate(t, t.account)))
  const open = inRange.filter((t) => !t.applied_to_balance)
  const done = inRange.filter((t) => t.applied_to_balance)
  const invoices = acc ? [] : unpaidInvoices(ctx).filter((i) => inPeriod(i.dueDate))
  const target = acc ? `na conta ${acc.name}` : 'no geral'

  if (inRange.length === 0 && invoices.length === 0) {
    return { intent: 'explain', text: `Não encontrei movimentações ${target} com vencimento ${where}.`, suggestions: follow }
  }
  if (open.length === 0 && invoices.length === 0) {
    return {
      intent: 'explain',
      text: lines(
        `${acc ? acc.name : 'Seu mês'} ${where}: tudo o que vence no período já está confirmado (${done.length} ${done.length === 1 ? 'movimentação' : 'movimentações'}).`,
        'Se o saldo ainda não bate, confira se não falta lançar algo ou se há faturas de cartão de outros meses em aberto.'
      ),
      suggestions: follow,
    }
  }
  const toPay = open.filter((x) => x.type === 'expense')
  const toReceive = open.filter((x) => x.type === 'income')
  const list = [...open]
    .sort((a, b) => transactionDueDate(a, a.account).localeCompare(transactionDueDate(b, b.account)))
    .slice(0, 6)
    .map((t) => `• ${t.description} — ${t.type === 'income' ? 'a receber' : 'a pagar'} ${brl(t.amount_cents)} (vence ${formatDate(transactionDueDate(t, t.account))})`)
  return {
    intent: 'explain',
    text: lines(
      `${acc ? acc.name : 'Seu mês'} ${where} ainda não fechou porque tem coisa sem confirmar:`,
      toPay.length > 0 && `• ${toPay.length} ${toPay.length === 1 ? 'conta' : 'contas'} a pagar: ${brl(sumBy(toPay, (t) => t.amount_cents))}`,
      toReceive.length > 0 && `• ${toReceive.length} a receber: ${brl(sumBy(toReceive, (t) => t.amount_cents))}`,
      invoices.length > 0 && `• ${invoices.length} ${invoices.length === 1 ? 'fatura de cartão' : 'faturas de cartão'} sem pagamento: ${brl(sumBy(invoices, (i) => i.totalCents))}`,
      ...list,
      'O saldo só muda quando você confirma ("Pagar"/"Receber") em Movimentações — nada é confirmado sozinho.'
    ),
    suggestions: follow,
  }
}

function replyUnknown(ctx: AssistantContext): Reply {
  return {
    intent: 'unknown',
    text: `Não entendi bem essa pergunta. Eu respondo sobre os números das suas finanças: gastos, receitas, saldo, vencimentos, faturas, orçamento, metas e empréstimos. Tente uma destas, ${ctx.name} está aqui para ajudar:`,
    suggestions: MENU,
  }
}

// ---------------------------------------------------------------- análises extras

const ymOf = (iso: string) => iso.slice(0, 7)
const daysInMonthISO = (iso: string) => {
  const [y, m] = iso.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/** Período a comparar: o pedido (se tem mês anterior) ou o mês atual; no mês corrente compara até o mesmo dia do anterior. */
function comparePeriods(ctx: AssistantContext, period: Period) {
  const p = period.previous ? period : parsePeriod('', ctx.today)
  const prev = p.previous!
  let to = p.to
  let prevTo = prev.to
  if (ctx.today >= p.from && ctx.today <= p.to) {
    to = ctx.today
    const day = Number(ctx.today.slice(8, 10))
    const lastPrev = Number(prev.to.slice(8, 10))
    prevTo = `${prev.from.slice(0, 8)}${String(Math.min(day, lastPrev)).padStart(2, '0')}`
  }
  return { cur: { from: p.from, to, label: p.label }, prev: { from: prev.from, to: prevTo, label: prev.label }, partial: to !== p.to }
}

// "compare com o mês passado": o mês passado é o termo de comparação, não o período pedido (a menos que haja um mês explícito)
function comparePeriod(q: string, ctx: AssistantContext): Period {
  return parsePeriod(q.replace(/(mes (passado|anterior)|ultimo mes)/g, ' '), ctx.today)
}

function categoryTotals(rows: TransactionWithRelations[]) {
  const map = new Map<string, { name: string; cents: number }>()
  for (const t of rows) {
    const id = t.category?.id ?? 'none'
    const cur = map.get(id)
    map.set(id, { name: t.category?.name ?? 'Sem categoria', cents: (cur?.cents ?? 0) + t.amount_cents })
  }
  return map
}

function replyCompare(ctx: AssistantContext, period: Period, why: boolean): Reply {
  const { cur, prev, partial } = comparePeriods(ctx, period)
  const exp = (r: { from: string; to: string }) => filterTx(ctx, { type: 'expense' }, r.from, r.to)
  const inc = (r: { from: string; to: string }) => filterTx(ctx, { type: 'income' }, r.from, r.to)
  const curExp = exp(cur)
  const prevExp = exp(prev)
  const curE = sumBy(curExp, (t) => t.amount_cents)
  const prevE = sumBy(prevExp, (t) => t.amount_cents)
  const curI = sumBy(inc(cur), (t) => t.amount_cents)
  const prevI = sumBy(inc(prev), (t) => t.amount_cents)
  if (curE === 0 && prevE === 0 && curI === 0 && prevI === 0) {
    return { intent: why ? 'why_spent' : 'compare', text: 'Não encontrei lançamentos nesses dois períodos para comparar.', suggestions: MENU }
  }
  const delta = (a: number, b: number, goodWhenUp: boolean) => {
    if (b === 0) return a === 0 ? 'igual' : 'sem base de comparação'
    const diff = a - b
    if (diff === 0) return 'igual'
    const p = pct(Math.abs(diff / b) * 100)
    return `${diff > 0 ? '+' : '-'}${p} (${brl(Math.abs(diff))} ${diff > 0 ? 'a mais' : 'a menos'}) ${diff > 0 === goodWhenUp ? '👍' : '⚠️'}`
  }
  const a = categoryTotals(curExp)
  const b = categoryTotals(prevExp)
  const changes = [...a.entries()]
    .map(([id, v]) => ({ name: v.name, diff: v.cents - (b.get(id)?.cents ?? 0), cents: v.cents }))
    .filter((c) => c.diff > 0)
    .sort((x, y) => y.diff - x.diff)
    .slice(0, 3)
  const dropped = [...b.entries()]
    .map(([id, v]) => ({ name: v.name, diff: (a.get(id)?.cents ?? 0) - v.cents }))
    .filter((c) => c.diff < 0)
    .sort((x, y) => x.diff - y.diff)
    .slice(0, 2)
  const topItems = (name: string) =>
    curExp
      .filter((t) => (t.category?.name ?? 'Sem categoria') === name)
      .sort((x, y) => y.amount_cents - x.amount_cents)
      .slice(0, 2)
      .map((t) => `${t.description} (${brl(t.amount_cents)})`)
      .join(', ')
  const head = `${cur.label} x ${prev.label}${partial ? ' (até o mesmo dia)' : ''}:`
  return {
    intent: why ? 'why_spent' : 'compare',
    text: lines(
      head,
      `• Gastos: ${brl(curE)} contra ${brl(prevE)} — ${delta(curE, prevE, false)}`,
      `• Receitas: ${brl(curI)} contra ${brl(prevI)} — ${delta(curI, prevI, true)}`,
      changes.length > 0 && (why || curE > prevE ? 'O que mais pesou a mais nos gastos:' : 'Categorias que subiram:'),
      ...changes.map((c) => `• ${c.name}: +${brl(c.diff)} (agora ${brl(c.cents)})${topItems(c.name) ? ` — maiores: ${topItems(c.name)}` : ''}`),
      dropped.length > 0 && 'O que diminuiu:',
      ...dropped.map((c) => `• ${c.name}: ${brl(c.diff)}`)
    ),
    suggestions: ['Onde mais gasto?', 'Me dê uma dica', 'Como está meu mês?'],
  }
}

function replyDaily(ctx: AssistantContext): Reply {
  if (ctx.accounts.filter((a) => !a.archived && a.type !== 'credit_card').length === 0) {
    return { intent: 'daily', text: 'Cadastre uma conta para eu calcular quanto você pode gastar por dia.', suggestions: MENU }
  }
  const end = monthEnd(ctx.today)
  const f = computeForecast(ctx.accounts, ctx.transactions, ctx.transfers, ctx.today, end)
  const daysLeft = daysInMonthISO(ctx.today) - Number(ctx.today.slice(8, 10)) + 1
  const safe = Math.min(f.endCents, f.minCents)
  if (safe <= 0) {
    return {
      intent: 'daily',
      text: lines(
        `Considerando o que ainda vai entrar e sair, seu saldo previsto para ${formatDate(end)} é ${brl(f.endCents)} (ponto mais baixo ${brl(f.minCents)}).`,
        'Ou seja: não há folga para gastos extras até o fim do mês. Priorize só o essencial.'
      ),
      suggestions: ['Vou ficar no vermelho?', 'O que vence essa semana?', 'Me dê uma dica'],
    }
  }
  return {
    intent: 'daily',
    text: lines(
      `Depois de pagar o que está em aberto, sobram ${brl(safe)} até ${formatDate(end)}.`,
      `Em ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'}, isso dá cerca de ${brl(Math.floor(safe / daysLeft))} por dia sem ficar no vermelho.`,
      'É uma estimativa com o que está lançado hoje; novas contas mudam o resultado.'
    ),
    suggestions: ['Vou ficar no vermelho?', 'Como está meu mês?', 'Me dê uma dica'],
  }
}

function replyAfford(ctx: AssistantContext, raw: string): Reply {
  const amount = parseAmountCents(raw)
  if (amount === null) return replyDaily(ctx)
  if (ctx.accounts.filter((a) => !a.archived && a.type !== 'credit_card').length === 0) {
    return { intent: 'afford', text: 'Cadastre uma conta para eu avaliar se cabe no seu mês.', suggestions: MENU }
  }
  const end = monthEnd(ctx.today)
  const f = computeForecast(ctx.accounts, ctx.transactions, ctx.transfers, ctx.today, end)
  const worst = f.minCents - amount
  const after = f.endCents - amount
  const parcelMatch = norm(raw).match(/(\d{1,2}) ?x\b|(\d{1,2}) (vezes|parcelas)|em (\d{1,2}) (vezes|parcelas)/)
  const installments = parcelMatch ? Number(parcelMatch[1] ?? parcelMatch[2] ?? parcelMatch[4]) : 0
  const parcel = installments > 1 || /parcel|vezes/.test(norm(raw))
  const out: string[] = [`Gastar ${brl(amount)} agora${parcel ? ' (à vista; parcelado, pese só a 1ª parcela)' : ''}, considerando o que ainda vence neste mês:`]
  if (worst >= 0) {
    out.push(`✅ Cabe. O ponto mais baixo do saldo iria de ${brl(f.minCents)} para ${brl(worst)} e você termina o mês com ${brl(after)}.`)
  } else {
    const firstNeg = f.days.find((d) => d.balanceCents - amount < 0)
    out.push(`⚠️ Não cabe sem sufoco: o saldo ficaria negativo${firstNeg ? ` a partir de ${formatDate(firstNeg.date)}` : ''}, chegando a ${brl(worst)}.`)
    out.push(`Hoje você tem ${brl(f.startCents)} e termina o mês previsto em ${brl(f.endCents)} sem essa compra.`)
  }
  const spent = sumBy(filterTx(ctx, { type: 'expense' }, parsePeriod('', ctx.today).from, ctx.today), (t) => t.amount_cents)
  if (spent > 0) out.push(`Até agora neste mês você já gastou ${brl(spent)}.`)
  if (installments > 1) out.push(...installmentNote(ctx, amount, installments))
  return { intent: 'afford', text: lines(...out), suggestions: ['Vou ficar no vermelho?', 'Quanto posso gastar por dia?', 'O que vence essa semana?'] }
}

function replyAverage(ctx: AssistantContext, q: string): Reply {
  const category = findCategory(q, ctx.categories)
  const [y, m] = ctx.today.split('-').map(Number)
  const type: 'expense' | 'income' = /receit|ganh|renda|salario/.test(q) ? 'income' : 'expense'
  const months: { ym: string; cents: number }[] = []
  for (let i = 1; i <= 6; i++) {
    const d = new Date(y, m - 1 - i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const rows = ctx.transactions.filter((t) => t.type === type && ymOf(t.date) === ym && (!category || t.category_id === category.id))
    if (rows.length > 0) months.push({ ym, cents: sumBy(rows, (t) => t.amount_cents) })
  }
  const noun = type === 'expense' ? 'gastos' : 'receitas'
  if (months.length === 0) {
    return { intent: 'average', text: `Ainda não tenho meses fechados com ${noun}${category ? ` em ${category.name}` : ''} para calcular uma média.`, suggestions: MENU }
  }
  const avg = Math.round(sumBy(months, (x) => x.cents) / months.length)
  const high = [...months].sort((a, b) => b.cents - a.cents)[0]
  const low = [...months].sort((a, b) => a.cents - b.cents)[0]
  const cur = sumBy(ctx.transactions.filter((t) => t.type === type && ymOf(t.date) === ymOf(ctx.today) && (!category || t.category_id === category.id)), (t) => t.amount_cents)
  const lbl = (ym: string) => invoicePeriodLabel(ym)
  return {
    intent: 'average',
    text: lines(
      `Média mensal de ${noun}${category ? ` em ${category.name}` : ''} nos últimos ${months.length} ${months.length === 1 ? 'mês' : 'meses'} fechados: ${brl(avg)}.`,
      months.length > 1 && `• Maior: ${lbl(high.ym)} (${brl(high.cents)})`,
      months.length > 1 && `• Menor: ${lbl(low.ym)} (${brl(low.cents)})`,
      `Neste mês, até agora: ${brl(cur)} (${cur > avg ? 'acima' : 'abaixo'} da média).`
    ),
    suggestions: ['Compare com o mês passado', 'Onde mais gasto?', 'Me dê uma dica'],
  }
}

function replyRecurring(ctx: AssistantContext): Reply {
  const series = new Map<string, TransactionWithRelations[]>()
  for (const t of ctx.transactions) {
    if (!t.series_id || (t.installment_total ?? 0) < 2) continue
    series.set(t.series_id, [...(series.get(t.series_id) ?? []), t])
  }
  const active = [...series.values()]
    .map((rows) => {
      const left = rows.filter((r) => r.date > ctx.today)
      const base = [...rows].sort((a, b) => a.date.localeCompare(b.date))[0]
      return { base, left, total: sumBy(left, (r) => r.amount_cents), last: left.map((r) => r.date).sort().pop() ?? '' }
    })
    .filter((s) => s.left.length > 0)
    .sort((a, b) => b.total - a.total)
  if (active.length === 0) {
    return { intent: 'recurring', text: 'Não encontrei compras parceladas ou recorrentes com parcelas futuras.', suggestions: MENU }
  }
  const monthly = sumBy(active, (s) => s.base.amount_cents)
  const name = (d: string) => d.replace(/\s*\(\d+\/\d+\)\s*$/, '')
  return {
    intent: 'recurring',
    text: lines(
      `Você tem ${active.length} ${active.length === 1 ? 'compra parcelada/recorrente' : 'compras parceladas/recorrentes'} em andamento, cerca de ${brl(monthly)} por mês, e ainda faltam ${brl(sumBy(active, (s) => s.total))} no total.`,
      ...active.slice(0, 6).map((s) => `• ${name(s.base.description)}: faltam ${s.left.length} ${s.left.length === 1 ? 'parcela' : 'parcelas'} de ${brl(s.base.amount_cents)} (até ${formatDate(s.last)})`),
      active.length > 6 && 'E mais algumas. Veja a lista completa em Movimentações.'
    ),
    suggestions: ['Vou ficar no vermelho?', 'Qual minha fatura?', 'Me dê uma dica'],
  }
}

function replyBiggest(ctx: AssistantContext, q: string, period: Period): Reply {
  const type: 'expense' | 'income' = /receit|entrada|ganh/.test(q) ? 'income' : 'expense'
  const rows = filterTx(ctx, { type }, period.from, period.to).sort((a, b) => b.amount_cents - a.amount_cents).slice(0, 5)
  if (rows.length === 0) {
    return { intent: 'biggest', text: `Não encontrei ${type === 'expense' ? 'gastos' : 'receitas'} ${period.label}.`, suggestions: MENU }
  }
  return {
    intent: 'biggest',
    text: lines(
      `Maiores ${type === 'expense' ? 'compras/despesas' : 'receitas'} ${period.label}:`,
      ...rows.map((t, i) => `${i + 1}. ${t.description} — ${brl(t.amount_cents)} (${formatDate(t.date)}${t.category ? `, ${t.category.name}` : ''})`)
    ),
    suggestions: ['Onde mais gasto?', 'Compare com o mês passado', 'Me dê uma dica'],
  }
}

/** Pergunta com nome de conta/categoria/estabelecimento mas sem verbo claro: mostra um retrato do que foi citado. */
function replyEntity(ctx: AssistantContext, q: string, period: Period): Reply | null {
  const cur = parsePeriod('', ctx.today)
  const account = findAccount(q, ctx.accounts.filter((a) => !a.archived))
  if (account) {
    if (account.type === 'credit_card') return replyCard(ctx, q)
    const exp = sumBy(ctx.transactions.filter((t) => t.account_id === account.id && t.type === 'expense' && t.date >= cur.from && t.date <= cur.to), (t) => t.amount_cents)
    const inc = sumBy(ctx.transactions.filter((t) => t.account_id === account.id && t.type === 'income' && t.date >= cur.from && t.date <= cur.to), (t) => t.amount_cents)
    const open = ctx.transactions.filter((t) => t.account_id === account.id && !t.applied_to_balance)
    return {
      intent: 'balance',
      text: lines(
        `${account.name}: saldo de ${brl(account.balance_cents)}.`,
        `Neste mês: ${brl(inc)} de receitas e ${brl(exp)} de despesas.`,
        open.length > 0 ? `Há ${open.length} ${open.length === 1 ? 'item' : 'itens'} em aberto (${brl(sumBy(open, (t) => (t.type === 'income' ? t.amount_cents : -t.amount_cents)))} de efeito líquido quando confirmados).` : 'Nada em aberto nessa conta.'
      ),
      suggestions: [`Por que a conta ${account.name} não fechou?`, 'Qual meu saldo?', 'Como está meu mês?'],
    }
  }
  const category = findCategory(q, ctx.categories)
  if (category) return replyMoney(ctx, q, period.isDefault ? cur : period, category.type === 'income' ? 'income' : 'expense')
  const words = topicWords(q)
  for (const w of words) {
    const hits = ctx.transactions.filter((t) => norm(t.description).includes(w))
    if (hits.length > 0) return replyMoney(ctx, q, period.isDefault ? parsePeriod('ultimos 6 meses', ctx.today) : period, hits[0].type === 'income' ? 'income' : 'expense')
  }
  return null
}

const GUESS: { intent: Intent; stems: string[] }[] = [
  { intent: 'balance', stems: ['sald', 'dinheir', 'dispon', 'tenho'] },
  { intent: 'expenses', stems: ['gast', 'despes', 'pagu', 'compr'] },
  { intent: 'income', stems: ['receit', 'receb', 'ganh', 'salar', 'renda'] },
  { intent: 'due', stems: ['venc', 'pagar', 'atras', 'abert', 'pendent'] },
  { intent: 'card', stems: ['fatur', 'cart', 'limit'] },
  { intent: 'forecast', stems: ['previs', 'futur', 'sobra', 'faltar', 'fim'] },
  { intent: 'summary', stems: ['resum', 'situac', 'panoram', 'mes'] },
  { intent: 'tips', stems: ['dica', 'ajud', 'melhor', 'econom'] },
  { intent: 'goals', stems: ['meta', 'reserv', 'objetiv'] },
  { intent: 'loans', stems: ['empre', 'deve', 'fiado'] },
]

/** Último recurso: a intenção cujas raízes de palavra mais aparecem na pergunta. */
function guessIntent(q: string): Intent | null {
  const words = q.split(' ')
  let best: Intent | null = null
  let bestScore = 0
  for (const g of GUESS) {
    const score = g.stems.filter((s) => words.some((w) => w.startsWith(s))).length
    if (score > bestScore) {
      bestScore = score
      best = g.intent
    }
  }
  return best
}

// Para vencimentos, "semana"/"hoje"/"amanhã"/"este mês" olham para a FRENTE (e sempre incluem o que já está atrasado).
function dueWindow(q: string, ctx: AssistantContext, period: Period): Period {
  const today = ctx.today
  const floor = '0000-01-01'
  if (/semana passada|mes passado|mes anterior/.test(q)) return period
  if (/amanha/.test(q)) return { from: floor, to: addDaysISO(today, 1), label: 'até amanhã' }
  if (/hoje/.test(q)) return { from: floor, to: today, label: 'até hoje' }
  if (/semana/.test(q)) return { from: floor, to: addDaysISO(today, 7), label: 'nos próximos 7 dias' }
  if (/(este|esse|neste|nesse) mes/.test(q)) return { from: floor, to: monthEnd(today), label: 'até o fim do mês' }
  return period
}

// ---------------------------------------------------------------- entrada

export function answerQuestion(question: string, ctx: AssistantContext, prev?: Memory | null): Reply {
  const names = [...ctx.accounts.map((a) => a.name), ...ctx.categories.map((c) => c.name)].flatMap((n) => normalize(n).split(' '))
  let q = fixTypos(normalize(question), names)
  if (!q) return replyHelp(ctx)
  let intent = detectIntent(q)

  // pergunta curta de continuação ("e no mês passado?", "e de transporte?"): reaproveita o assunto da anterior
  if (prev?.question && intent === 'unknown' && q.split(' ').length <= 8) {
    const tail = q.replace(/^(e se|e agora|e|mas|entao|tambem|agora) /, '')
    const merged = fixTypos(normalize(`${stripPeriod(prev.question)} ${tail}`), names)
    const mi = detectIntent(merged)
    if (mi !== 'unknown') {
      q = merged
      intent = mi
    }
  }

  const reply = route(question, q, intent, ctx)
  const advice = adviceFor(reply.intent, ctx)
  return { ...reply, text: advice ? `${reply.text}\n\n${advice}` : reply.text, asked: q }
}

function route(raw: string, q: string, intent: Intent, ctx: AssistantContext): Reply {
  const period = parsePeriod(q, ctx.today)

  switch (intent) {
    case 'help':
      return replyHelp(ctx)
    case 'balance':
      return replyBalance(ctx)
    case 'health':
      return replyHealth(ctx)
    case 'plan':
      return replyPlan(ctx)
    case 'reserve':
      return replyReserve(ctx)
    case 'goal_plan':
      return replyGoalPlan(ctx, raw)
    case 'overspend':
      return replyOverspend(ctx)
    case 'pay_or_save':
      return replyPayOrSave(ctx)
    case 'afford':
      return replyAfford(ctx, raw)
    case 'daily':
      return replyDaily(ctx)
    case 'compare':
      return replyCompare(ctx, comparePeriod(q, ctx), false)
    case 'why_spent':
      return replyCompare(ctx, comparePeriod(q, ctx), true)
    case 'average':
      return replyAverage(ctx, q)
    case 'recurring':
      return replyRecurring(ctx)
    case 'biggest':
      return replyBiggest(ctx, q, period)
    case 'forecast':
      return replyForecast(ctx)
    case 'budget':
      return replyBudget(ctx)
    case 'explain':
      return replyExplain(ctx, q, period)
    case 'card':
      // "quanto gastei no cartão X": gastos daquela conta; senão, faturas
      return /gast|compra|comprei/.test(q) ? replyMoney(ctx, q, period, 'expense') : replyCard(ctx, q)
    case 'loans':
      return replyLoans(ctx, q)
    case 'goals':
      return replyGoals(ctx)
    case 'due':
      return replyDue(ctx, dueWindow(q, ctx, period), 'expense')
    case 'receivable':
      return replyDue(ctx, dueWindow(q, ctx, period), 'income')
    case 'top_expenses':
      return replyTopExpenses(ctx, period)
    case 'income':
      return replyMoney(ctx, q, period, 'income')
    case 'expenses':
      return replyMoney(ctx, q, period, 'expense')
    case 'savings':
      return replySavings(ctx, period)
    case 'summary':
      return replySummary(ctx, period)
    case 'tips':
      return replyTips(ctx)
    default: {
      // sem regra clara: tenta pelo nome de conta/categoria/estabelecimento citado, depois pela palavra mais parecida
      const byName = replyEntity(ctx, q, period)
      if (byName) return byName
      const guess = guessIntent(q)
      if (guess && guess !== 'unknown') return route(raw, q, guess, ctx)
      return replyUnknown(ctx)
    }
  }
}
