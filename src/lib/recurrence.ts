// Lógica pura das recorrências (sem React, sem banco): datas esperadas, previsões, histórico e estatísticas.
//
// Regras que esta camada garante:
//  * Previsão NUNCA é movimentação: nada aqui cria linha; o app só mostra "previsto/estimado" até o usuário informar o valor.
//  * Uma ocorrência já cumprida (linha ligada pela recorrência, ou lançada à mão com descrição e vencimento
//    parecidos) some da previsão — não duplica o que o usuário já lançou.
//  * Recorrência de valor FIXO com série (linhas já criadas) não gera previsão; fixa SEM série (ex.: sugerida pelo app) prevê pelo valor fixo;
//    variável e "por ocorrência" sempre geram previsão.
//  * Pausada/encerrada não gera previsão; reativar só prevê a partir de `active_from`.
import { transactionDueDate } from './invoices'
import type { Recurrence, RecurrenceFrequency, RecurrenceMode, TransactionWithRelations } from '../types/database'

type Tx = TransactionWithRelations

export const MODE_LABEL: Record<RecurrenceMode, string> = {
  fixed: 'Valor fixo',
  variable: 'Valor variável',
  per_occurrence: 'Por ocorrência',
}

export const MODE_HELP: Record<RecurrenceMode, string> = {
  fixed: 'O mesmo valor em cada repetição. Já cria as próximas ocorrências.',
  variable: 'O valor muda a cada vez (luz, água, cartão…). As próximas aparecem como previsão pela média, até você informar o valor real.',
  per_occurrence: 'Reconhece a frequência, mas não prevê valor. Só lembra que aquela despesa costuma acontecer.',
}

export const FREQUENCY_LABEL: Record<RecurrenceFrequency, string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
  yearly: 'Anual',
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

export function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

/** Data da k-ésima ocorrência a partir da âncora (mês curto: ajusta para o último dia; calcula sempre da âncora, sem acumular erro). */
export function addPeriods(anchor: string, frequency: RecurrenceFrequency, k: number): string {
  const [y, m, d] = anchor.split('-').map(Number)
  if (frequency === 'weekly') {
    const dt = new Date(y, m - 1, d + 7 * k)
    return iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
  }
  if (frequency === 'yearly') {
    const ny = y + k
    return iso(ny, m, Math.min(d, new Date(ny, m, 0).getDate()))
  }
  const total = m - 1 + k
  const ny = y + Math.floor(total / 12)
  const nm = (((total % 12) + 12) % 12) + 1
  return iso(ny, nm, Math.min(d, new Date(ny, nm, 0).getDate()))
}

/** Datas esperadas entre `from` e `to` (inclusive), respeitando início de previsão, encerramento e datas puladas. */
export function expectedDates(rec: Recurrence, from: string, to: string): string[] {
  const out: string[] = []
  const floor = from > rec.active_from ? from : rec.active_from
  const skipped = new Set(rec.skipped_dates ?? [])
  for (let k = 0; k < 1500; k++) {
    const d = addPeriods(rec.anchor_date, rec.frequency, k)
    if (d > to) break
    if (d < floor) continue
    if (rec.ended_at && d > rec.ended_at) break
    if (skipped.has(d)) continue
    out.push(d)
  }
  return out
}

// ---------------------------------------------------------------- reconhecer "a mesma despesa"

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(\s*\d+\s*\/\s*\d+\s*\)/g, ' ') // sufixo de parcela "(3/12)"
    .replace(/\d+/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sameExpense(a: string, b: string): boolean {
  const x = normalizeName(a)
  const y = normalizeName(b)
  if (x.length < 3 || y.length < 3) return false
  return x === y || x.includes(y) || y.includes(x)
}

/** Quantos dias de diferença ainda contam como "a mesma ocorrência". */
function tolerance(frequency: RecurrenceFrequency): number {
  return frequency === 'weekly' ? 3 : frequency === 'yearly' ? 30 : 12
}

/** Quanto tempo para trás uma ocorrência não informada ainda aparece como "pendente de informar". */
function lookbackDays(frequency: RecurrenceFrequency): number {
  return frequency === 'weekly' ? 14 : frequency === 'yearly' ? 400 : 62
}

/** Movimentações lançadas à mão que cumprem uma ocorrência esperada (cada data esperada é cumprida por no máximo uma). */
function matchedManual(rec: Recurrence, txs: Tx[], expected: string[]): Map<string, Tx> {
  const result = new Map<string, Tx>()
  if (expected.length === 0) return result
  const tol = tolerance(rec.frequency)
  const candidates = txs
    .filter((t) => !t.recurrence_id && !t.series_id && t.type === rec.type && sameExpense(t.description, rec.description))
    .map((t) => ({ t, due: transactionDueDate(t, t.account) }))
    .sort((a, b) => a.due.localeCompare(b.due))
  for (const { t, due } of candidates) {
    let best: string | null = null
    let bestDiff = Infinity
    for (const e of expected) {
      if (result.has(e)) continue
      const diff = Math.abs(daysBetween(e, due))
      if (diff <= tol && diff < bestDiff) {
        best = e
        bestDiff = diff
      }
    }
    if (best) result.set(best, t)
  }
  return result
}

function expectedUpTo(rec: Recurrence, txs: Tx[], horizonEnd: string): string[] {
  // para casar lançamentos, olhamos de ANTES da âncora (recorrência aceita por sugestão nasce com a âncora na última
  // ocorrência, mas o histórico vem de antes) até o último lançamento/horizonte; ignora active_from/ended_at/skipped de propósito
  const last = txs.reduce((max, t) => (t.date > max ? t.date : max), horizonEnd)
  const first = txs.reduce((min, t) => (t.date < min ? t.date : min), rec.anchor_date)
  let back = 0
  while (back < 1500 && addPeriods(rec.anchor_date, rec.frequency, -(back + 1)) >= addDaysISO(first, -35)) back++
  const all: string[] = []
  for (let k = -back; k < 1500; k++) {
    const d = addPeriods(rec.anchor_date, rec.frequency, k)
    if (d > last) break
    all.push(d)
  }
  return all
}

// ---------------------------------------------------------------- histórico e estimativa

/** Movimentações que pertencem à recorrência: ligadas por ela, da série adotada, ou lançadas à mão e reconhecidas. */
export function recurrenceHistory(rec: Recurrence, txs: Tx[]): Tx[] {
  const linked = txs.filter((t) => (t.recurrence_id && t.recurrence_id === rec.id) || (rec.series_id && t.series_id === rec.series_id))
  const out = [...linked]
  if (rec.mode !== 'fixed' || !rec.series_id) {
    const manual = matchedManual(rec, txs, expectedUpTo(rec, txs, '0000-00-00'))
    for (const t of manual.values()) if (!out.includes(t)) out.push(t)
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** Média dos últimos valores reais (até 6). Sem histórico, usa o valor base cadastrado; sem nada, null. */
export function estimateAmount(rec: Recurrence, history: Tx[]): number | null {
  const recent = history.slice(-6)
  if (recent.length > 0) return Math.round(recent.reduce((s, t) => s + t.amount_cents, 0) / recent.length)
  return rec.amount_cents ?? null
}

// ---------------------------------------------------------------- previsões

export interface PredictedOccurrence {
  key: string
  recurrence: Recurrence
  /** data esperada (e chave da ocorrência) */
  date: string
  /** valor estimado (média); null quando a modalidade é "por ocorrência" ou não há base */
  amountCents: number | null
  /** quantas ocorrências reais embasaram a média */
  basedOn: number
  overdue: boolean
}

/**
 * Próximas ocorrências ainda NÃO cumpridas, de recorrências ativas de valor variável / por ocorrência.
 * Inclui as que já passaram da data e continuam sem valor informado (até ~2 períodos para trás).
 */
export function predictOccurrences(recs: Recurrence[], txs: Tx[], today: string, horizonEnd: string): PredictedOccurrence[] {
  const out: PredictedOccurrence[] = []
  for (const rec of recs) {
    if (rec.status !== 'active' || (rec.mode === 'fixed' && rec.series_id)) continue
    const from = addDaysISO(today, -lookbackDays(rec.frequency))
    const dates = expectedDates(rec, from, horizonEnd)
    if (dates.length === 0) continue
    const fulfilledByLink = new Set(txs.filter((t) => t.recurrence_id === rec.id && t.recurrence_date).map((t) => t.recurrence_date as string))
    const manual = matchedManual(rec, txs, expectedUpTo(rec, txs, horizonEnd))
    const history = recurrenceHistory(rec, txs)
    const amount = rec.mode === 'variable' ? estimateAmount(rec, history) : rec.mode === 'fixed' ? (rec.amount_cents ?? estimateAmount(rec, history)) : null
    for (const d of dates) {
      if (fulfilledByLink.has(d) || manual.has(d)) continue
      out.push({
        key: `${rec.id}:${d}`,
        recurrence: rec,
        date: d,
        amountCents: amount,
        basedOn: rec.mode === 'variable' ? Math.min(history.length, 6) : 0,
        overdue: d < today,
      })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

// ---------------------------------------------------------------- estatísticas (histórico e controle)

export interface RecurrenceStats {
  history: Tx[]
  count: number
  average: number | null
  max: Tx | null
  min: Tx | null
  last: Tx | null
  nextDate: string | null
  nextEstimateCents: number | null
  /** variação de cada ocorrência em relação à anterior */
  variation: { id: string; date: string; cents: number; deltaPct: number | null }[]
  /** variação entre a última ocorrência e a média das anteriores */
  trendPct: number | null
}

export function recurrenceStats(rec: Recurrence, txs: Tx[], today: string): RecurrenceStats {
  const history = recurrenceHistory(rec, txs)
  const count = history.length
  const average = count > 0 ? Math.round(history.reduce((s, t) => s + t.amount_cents, 0) / count) : null
  const max = count > 0 ? history.reduce((m, t) => (t.amount_cents > m.amount_cents ? t : m)) : null
  const min = count > 0 ? history.reduce((m, t) => (t.amount_cents < m.amount_cents ? t : m)) : null
  const last = count > 0 ? history[count - 1] : null
  const variation = history.map((t, i) => ({
    id: t.id,
    date: t.date,
    cents: t.amount_cents,
    deltaPct: i === 0 || history[i - 1].amount_cents === 0 ? null : ((t.amount_cents - history[i - 1].amount_cents) / history[i - 1].amount_cents) * 100,
  }))
  let trendPct: number | null = null
  if (count >= 3) {
    const before = history.slice(0, -1)
    const avgBefore = before.reduce((s, t) => s + t.amount_cents, 0) / before.length
    if (avgBefore > 0) trendPct = ((last!.amount_cents - avgBefore) / avgBefore) * 100
  }

  let nextDate: string | null = null
  let nextEstimateCents: number | null = null
  if (rec.status === 'active') {
    if (rec.mode === 'fixed' && rec.series_id) {
      const next = history.filter((t) => !t.applied_to_balance && transactionDueDate(t, t.account) >= today).sort((a, b) => a.date.localeCompare(b.date))[0]
      if (next) {
        nextDate = transactionDueDate(next, next.account)
        nextEstimateCents = next.amount_cents
      }
    } else {
      const horizon = addDaysISO(today, 400)
      const next = predictOccurrences([rec], txs, today, horizon).find((p) => p.date >= today) ?? null
      if (next) {
        nextDate = next.date
        nextEstimateCents = next.amountCents
      }
    }
  }
  return { history, count, average, max, min, last, nextDate, nextEstimateCents, variation, trendPct }
}

// ---------------------------------------------------------------- séries antigas (valor fixo) ainda sem cadastro

export interface LegacySeries {
  seriesId: string
  frequency: RecurrenceFrequency
  rows: Tx[]
  description: string
  type: Tx['type']
  accountId: string
  categoryId: string | null
  /** valor da ocorrência mais recente */
  amountCents: number
  anchorDate: string
}

/** Séries "Recorrente" criadas antes de existir o cadastro: aparecem como valor fixo sem alterar nenhuma movimentação. */
export function legacySeries(txs: Tx[], recs: Recurrence[]): LegacySeries[] {
  const adopted = new Set(recs.map((r) => r.series_id).filter(Boolean))
  const groups = new Map<string, Tx[]>()
  for (const t of txs) {
    if (!t.series_id || !t.recurrence_frequency) continue // parcelado não tem recurrence_frequency
    if (adopted.has(t.series_id)) continue
    groups.set(t.series_id, [...(groups.get(t.series_id) ?? []), t])
  }
  return [...groups.entries()]
    .map(([seriesId, rows]) => {
      const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
      const first = sorted[0]
      const last = sorted[sorted.length - 1]
      return {
        seriesId,
        frequency: first.recurrence_frequency as RecurrenceFrequency,
        rows: sorted,
        description: first.description,
        type: first.type,
        accountId: first.account_id,
        categoryId: first.category_id,
        amountCents: last.amount_cents,
        anchorDate: first.date,
      }
    })
    .sort((a, b) => b.anchorDate.localeCompare(a.anchorDate))
}

/** Linha a inserir em `recurrences` para adotar uma série antiga (nenhuma movimentação é tocada). */
export function recurrenceFromLegacy(s: LegacySeries, userId: string) {
  return {
    user_id: userId,
    account_id: s.accountId,
    category_id: s.categoryId,
    type: s.type,
    description: s.description,
    mode: 'fixed' as const,
    frequency: s.frequency,
    amount_cents: s.amountCents,
    anchor_date: s.anchorDate,
    active_from: s.anchorDate,
    status: 'active' as const,
    source: 'legacy' as const,
    series_id: s.seriesId,
  }
}

// ---------------------------------------------------------------- previsão de saldo (Planejamento)

export interface EstimateEvent {
  date: string
  label: string
  cents: number // positivo entra, negativo sai
  kind: 'estimate'
}

/** Eventos de ESTIMATIVA para a previsão de saldo. Só valor variável com média; "por ocorrência" não entra (sem valor). */
export function estimateEvents(preds: PredictedOccurrence[], today: string, endDate: string): EstimateEvent[] {
  const out: EstimateEvent[] = []
  for (const p of preds) {
    if (p.amountCents === null) continue
    const date = p.date < today ? today : p.date
    if (date > endDate) continue
    out.push({
      date,
      label: `${p.recurrence.description} (estimado)`,
      cents: p.recurrence.type === 'income' ? p.amountCents : -p.amountCents,
      kind: 'estimate',
    })
  }
  return out
}
