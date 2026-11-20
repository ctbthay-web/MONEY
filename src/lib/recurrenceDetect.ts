// Identificação inteligente de despesas/receitas recorrentes a partir do histórico.
// Só SUGERE: nada é criado sem o usuário confirmar. Não exige valores iguais — o que conta é o nome, a
// frequência (intervalo entre as datas) e a regularidade. Usa só movimentações reais (nunca previsões).
import { transactionDueDate } from './invoices'
import { addPeriods, normalizeName, sameExpense } from './recurrence'
import type { Recurrence, RecurrenceFrequency, RecurrenceMode, TransactionWithRelations } from '../types/database'

type Tx = TransactionWithRelations

export interface RecurrenceSuggestion {
  /** chave estável da sugestão (tipo + nome normalizado) */
  key: string
  description: string
  type: Tx['type']
  accountId: string
  categoryId: string | null
  frequency: RecurrenceFrequency
  /** modalidade sugerida: valores praticamente iguais → fixo; senão variável */
  mode: Extract<RecurrenceMode, 'fixed' | 'variable'>
  occurrences: number
  amounts: number[]
  averageCents: number
  minCents: number
  maxCents: number
  lastAmountCents: number
  lastDate: string
  nextDate: string
  /** 0..1: quão regular é o padrão */
  regularity: number
}

const FREQ_LABEL: Record<RecurrenceFrequency, string> = { weekly: 'toda semana', monthly: 'todo mês', yearly: 'todo ano' }
export const suggestionFrequencyText = (f: RecurrenceFrequency) => FREQ_LABEL[f]

function dayNum(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86400000)
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function mostCommon<T>(items: T[]): T | null {
  const count = new Map<T, number>()
  for (const i of items) count.set(i, (count.get(i) ?? 0) + 1)
  let best: T | null = null
  let bestN = 0
  for (const [k, n] of count) if (n > bestN) { best = k; bestN = n }
  return best
}

/** Mínimo de ocorrências, janela do intervalo (dias) e tolerância por frequência. */
const RULES: { frequency: RecurrenceFrequency; min: number; lo: number; hi: number; tol: number }[] = [
  { frequency: 'monthly', min: 3, lo: 25, hi: 36, tol: 5 },
  { frequency: 'yearly', min: 2, lo: 340, hi: 390, tol: 15 },
  // semanal exige mais repetições: compras frequentes (mercado, transporte) não podem virar "recorrência" por acaso
  { frequency: 'weekly', min: 6, lo: 5, hi: 9, tol: 2 },
]

const cleanName = (s: string) => s.replace(/\(\s*\d+\s*\/\s*\d+\s*\)/g, '').replace(/\s+/g, ' ').trim()

export function detectRecurrences(txs: Tx[], recs: Recurrence[], today: string): RecurrenceSuggestion[] {
  const groups = new Map<string, Tx[]>()
  for (const t of txs) {
    // parcelado/série e o que já pertence a uma recorrência ficam de fora
    if (t.series_id || t.recurrence_id) continue
    const name = normalizeName(t.description)
    if (name.length < 3) continue
    const key = `${t.type}|${name}`
    groups.set(key, [...(groups.get(key) ?? []), t])
  }

  const out: RecurrenceSuggestion[] = []
  for (const [key, rows] of groups) {
    const sample = rows[0]
    // já cadastrada (em qualquer situação, inclusive "dispensada") → não sugere de novo
    if (recs.some((r) => r.type === sample.type && sameExpense(r.description, sample.description))) continue

    const dated = rows
      .map((t) => ({ t, day: dayNum(t.account?.type === 'credit_card' ? t.date : transactionDueDate(t, t.account)) }))
      .sort((a, b) => a.day - b.day)
    if (dated.length < 2) continue
    const intervals = dated.slice(1).map((d, i) => d.day - dated[i].day)
    const med = median(intervals)

    const rule = RULES.find((r) => med >= r.lo && med <= r.hi)
    if (!rule || dated.length < rule.min) continue
    const within = intervals.filter((i) => Math.abs(i - med) <= rule.tol).length
    const regularity = within / intervals.length
    if (regularity < 0.75) continue

    const last = dated[dated.length - 1]
    // parou de acontecer: a última ocorrência já passou de ~2 períodos
    if (dayNum(today) - last.day > med * 2.2) continue

    const amounts = dated.map((d) => d.t.amount_cents)
    const average = Math.round(amounts.reduce((s, a) => s + a, 0) / amounts.length)
    const min = Math.min(...amounts)
    const max = Math.max(...amounts)
    const lastDate = last.t.account?.type === 'credit_card' ? last.t.date : transactionDueDate(last.t, last.t.account)

    out.push({
      key,
      description: cleanName(last.t.description),
      type: last.t.type,
      accountId: mostCommon(dated.map((d) => d.t.account_id)) ?? last.t.account_id,
      categoryId: mostCommon(dated.map((d) => d.t.category_id).filter(Boolean) as string[]),
      frequency: rule.frequency,
      mode: average > 0 && (max - min) / average <= 0.03 ? 'fixed' : 'variable',
      occurrences: dated.length,
      amounts,
      averageCents: average,
      minCents: min,
      maxCents: max,
      lastAmountCents: last.t.amount_cents,
      lastDate,
      nextDate: addPeriods(lastDate, rule.frequency, 1),
      regularity,
    })
  }
  return out.sort((a, b) => b.regularity * b.occurrences - a.regularity * a.occurrences || a.description.localeCompare(b.description))
}
