// Regras das notificações inteligentes (puras: recebem os dados e devolvem as mensagens).
// Datas sempre no horário de Brasília (UTC-3, sem horário de verão).

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const money = (cents) => BRL.format((cents || 0) / 100)

export function brasiliaNow(now = new Date()) {
  const d = new Date(now.getTime() - 3 * 3600 * 1000)
  const iso = d.toISOString()
  return { today: iso.slice(0, 10), hour: d.getUTCHours(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() }
}

const dayNum = (iso) => Math.round(Date.parse(iso + 'T00:00:00Z') / 86400000)
export const daysBetween = (fromIso, toIso) => dayNum(toIso) - dayNum(fromIso) // positivo = toIso no futuro
export const br = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

// ---- fatura de cartão (mesma regra de src/lib/invoices.ts) ----
function invoicePeriod(dateStr, closingDay) {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (d < closingDay) return `${y}-${String(m).padStart(2, '0')}` // no dia do fechamento já vai para a fatura seguinte
  const next = new Date(Date.UTC(y, m, 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`
}
function invoiceDueDate(period, closingDay, dueDay) {
  const [y, m] = period.split('-').map(Number)
  const off = dueDay <= closingDay ? 1 : 0
  const d = new Date(Date.UTC(y, m - 1 + off, dueDay))
  return d.toISOString().slice(0, 10)
}
function shiftPeriod(period, delta) {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function whenLabel(daysLeft) {
  if (daysLeft === 0) return 'vence hoje'
  if (daysLeft === 1) return 'vence amanhã'
  return `vence em ${daysLeft} dias`
}

/**
 * Gera as notificações do dia de UM usuário.
 * data: { transactions, accounts, transfers, goals, monthTransactions, schedules }
 * Cada item: { kind, level: 'alert'|'reminder'|'info', dedupe_key, title, body, url }
 */
export function buildForUser({ prefs, data, now = new Date() }) {
  const { today, hour, minutes } = brasiliaNow(now)
  const out = []
  const accountById = new Map(data.accounts.map((a) => [a.id, a]))
  const daysBefore = prefs.days_before ?? 1
  // O envio roda 1x por dia (cron da Vercel, 09h de Brasília): todos recebem nesse horário.
  // O antigo "horário dos avisos" por usuário foi removido porque nunca poderia ser respeitado.
  const afterHour = true
  void hour

  if (afterHour) {
    // ---------- contas a pagar / receber (conta comum, ainda não confirmadas) ----------
    if (prefs.notify_due || prefs.notify_receivable) {
      const dueSoon = new Map() // daysLeft -> itens
      const overdue = []
      const receivableToday = []
      for (const t of data.transactions) {
        const acc = accountById.get(t.account_id)
        if (!acc || acc.type === 'credit_card' || t.applied_to_balance) continue
        const due = t.due_date || t.date
        const left = daysBetween(today, due)
        if (t.type === 'income') {
          if (prefs.notify_receivable && left === 0) receivableToday.push(t)
          continue
        }
        if (!prefs.notify_due) continue
        if (left < 0 && left >= -90) overdue.push({ t, late: -left, due })
        else if (left === 0 || left === daysBefore) {
          const list = dueSoon.get(left) ?? []
          list.push({ t, due })
          dueSoon.set(left, list)
        }
      }

      for (const [left, items] of dueSoon) {
        if (items.length <= 3) {
          for (const { t, due } of items) {
            out.push({
              kind: 'due',
              level: left === 0 ? 'alert' : 'reminder',
              dedupe_key: `due:${t.id}:${due}:${left}`,
              title: left === 0 ? 'Conta vence hoje' : 'Conta próxima do vencimento',
              body: `${t.description} de ${money(t.amount_cents)} ${whenLabel(left)} (${br(due)}).`,
              url: '/transactions',
            })
          }
        } else {
          const total = items.reduce((s, i) => s + i.t.amount_cents, 0)
          out.push({
            kind: 'due',
            level: left === 0 ? 'alert' : 'reminder',
            dedupe_key: `due-group:${today}:${left}`,
            title: left === 0 ? 'Contas vencem hoje' : 'Contas próximas do vencimento',
            body: `${items.length} contas somando ${money(total)} ${left === 0 ? 'vencem hoje' : left === 1 ? 'vencem amanhã' : `vencem em ${left} dias`}.`,
            url: '/transactions',
          })
        }
      }

      // atrasadas: avisa 1x e repete a cada 7 dias enquanto continuar pendente
      for (const { t, late, due } of overdue) {
        const bucket = Math.floor((late - 1) / 7)
        out.push({
          kind: 'overdue',
          level: 'alert',
          dedupe_key: `overdue:${t.id}:${bucket}`,
          title: 'Conta em atraso',
          body: `${t.description} de ${money(t.amount_cents)} venceu em ${br(due)} e ainda consta como pendente.`,
          url: '/transactions',
        })
      }

      if (receivableToday.length === 1) {
        const t = receivableToday[0]
        out.push({
          kind: 'receivable',
          level: 'reminder',
          dedupe_key: `recv:${today}`,
          title: 'Recebimento previsto',
          body: `${t.description}: você tem ${money(t.amount_cents)} para receber hoje.`,
          url: '/transactions?type=income',
        })
      } else if (receivableToday.length > 1) {
        const total = receivableToday.reduce((s, t) => s + t.amount_cents, 0)
        out.push({
          kind: 'receivable',
          level: 'reminder',
          dedupe_key: `recv:${today}`,
          title: 'Recebimentos previstos',
          body: `Você tem ${money(total)} para receber hoje (${receivableToday.length} recebimentos).`,
          url: '/transactions?type=income',
        })
      }
    }

    // ---------- faturas de cartão ----------
    if (prefs.notify_cards) {
      const paid = new Set(data.transfers.filter((x) => x.invoice_period).map((x) => `${x.to_account_id}|${x.invoice_period}`))
      for (const card of data.accounts) {
        if (card.type !== 'credit_card' || !card.closing_day || !card.due_day) continue
        const current = invoicePeriod(today, card.closing_day)
        for (const period of [shiftPeriod(current, -1), current, shiftPeriod(current, 1)]) {
          if (paid.has(`${card.id}|${period}`)) continue
          const due = invoiceDueDate(period, card.closing_day, card.due_day)
          const left = daysBetween(today, due)
          const total = data.transactions
            .concat(data.cardTransactions || [])
            .filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i)
            .filter((t) => t.account_id === card.id && t.type === 'expense' && invoicePeriod(t.date, card.closing_day) === period)
            .reduce((s, t) => s + t.amount_cents, 0)
          if (total <= 0) continue
          if (left < 0 && left >= -30) {
            const bucket = Math.floor((-left - 1) / 7)
            out.push({
              kind: 'card',
              level: 'alert',
              dedupe_key: `card-late:${card.id}:${period}:${bucket}`,
              title: 'Fatura em atraso',
              body: `A fatura do cartão ${card.name} de ${money(total)} venceu em ${br(due)} e não consta como paga.`,
              url: '/accounts',
            })
          } else if ([3, 1, 0].includes(left)) {
            out.push({
              kind: 'card',
              level: left === 0 ? 'alert' : 'reminder',
              dedupe_key: `card:${card.id}:${period}:${left}`,
              title: left === 0 ? 'Fatura vence hoje' : 'Fatura próxima do vencimento',
              body: `Sua fatura do cartão ${card.name} está em ${money(total)} e ${whenLabel(left)} (${br(due)}).`,
              url: '/accounts',
            })
          }
        }
      }
    }

    // ---------- metas ----------
    if (prefs.notify_goals) {
      for (const g of data.goals) {
        if (g.archived || !g.target_cents) continue
        // só metas mexidas há pouco: evita avisar marcos antigos na primeira execução
        if (daysBetween(String(g.updated_at).slice(0, 10), today) > 2) continue
        const pct = Math.floor((g.accumulated_cents * 100) / g.target_cents)
        const m = [100, 80, 50, 25].find((x) => pct >= x)
        if (!m) continue
        out.push({
          kind: 'goal',
          level: 'info',
          dedupe_key: `goal:${g.id}:${m}`,
          title: m === 100 ? 'Meta alcançada!' : `Meta em ${m}%`,
          body:
            m === 100
              ? `Você completou a meta ${g.name}: ${money(g.accumulated_cents)} guardados.`
              : `Você atingiu ${m}% da meta ${g.name} (${money(g.accumulated_cents)} de ${money(g.target_cents)}).`,
          url: '/reserves',
        })
      }
    }

    // ---------- orçamento por categoria (plano Pro em diante: só existe se a pessoa criou) ----------
    if (prefs.notify_budgets !== false && (data.budgets || []).length) {
      const ym = today.slice(0, 7)
      const spent = new Map()
      for (const t of data.monthExpenses || []) spent.set(t.category_id, (spent.get(t.category_id) || 0) + t.amount_cents)
      const names = new Map((data.categories || []).map((c) => [c.id, c.name]))
      for (const b of data.budgets) {
        const used = spent.get(b.category_id) || 0
        const pct = Math.floor((used * 100) / b.amount_cents)
        const name = names.get(b.category_id) || 'categoria'
        if (pct >= 100) {
          out.push({
            kind: 'budget',
            level: 'alert',
            dedupe_key: `budget:${b.id}:${ym}:100`,
            title: 'Orçamento estourado',
            body: `Você gastou ${money(used)} em ${name}, acima do orçamento de ${money(b.amount_cents)} deste mês.`,
            url: '/planning',
          })
        } else if (pct >= 80) {
          out.push({
            kind: 'budget',
            level: 'reminder',
            dedupe_key: `budget:${b.id}:${ym}:80`,
            title: 'Orçamento quase no limite',
            body: `${name}: ${money(used)} de ${money(b.amount_cents)} (${pct}%) do orçamento deste mês.`,
            url: '/planning',
          })
        }
      }
    }

    // ---------- resumo do mês (no último dia do mês) ----------
    if (prefs.notify_summary) {
      const next = new Date(Date.parse(today + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10)
      if (next.slice(8, 10) === '01') {
        const ym = today.slice(0, 7)
        let inc = 0
        let exp = 0
        for (const t of data.monthTransactions || []) {
          if (t.date.slice(0, 7) !== ym) continue
          if (t.type === 'income') inc += t.amount_cents
          else exp += t.amount_cents
        }
        if (inc > 0 || exp > 0) {
          out.push({
            kind: 'summary',
            level: 'info',
            dedupe_key: `summary:${ym}`,
            title: 'Resumo financeiro',
            body: `Neste mês você recebeu ${money(inc)} e gastou ${money(exp)}.`,
            url: '/reports',
          })
        }
      }
    }
  }

  // ---------- programações do usuário ----------
  for (const s of data.schedules) {
    if (!s.active || s.last_sent_on === today) continue
    // sem horário próprio: dispara na execução diária do envio (09h de Brasília)
    void minutes
    const start = s.start_date
    if (today < start) continue
    let match = false
    if (s.frequency === 'once') match = today === start
    else if (s.frequency === 'daily') match = true
    else if (s.frequency === 'weekly') match = daysBetween(start, today) % 7 === 0
    else if (s.frequency === 'monthly') {
      const wanted = Number(start.slice(8, 10))
      const [y, m] = today.split('-').map(Number)
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
      match = Number(today.slice(8, 10)) === Math.min(wanted, lastDay)
    }
    if (!match) continue
    out.push({
      kind: 'schedule',
      level: 'reminder',
      dedupe_key: `schedule:${s.id}:${today}`,
      title: s.title,
      body: s.message || 'Lembrete programado.',
      url: '/',
      scheduleId: s.id,
      once: s.frequency === 'once',
    })
  }

  return out
}
