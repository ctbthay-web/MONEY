const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const numberFormatter = new Intl.NumberFormat('pt-BR')

/** Formata um valor em centavos (inteiro) para "R$ 1.234,56". */
export function formatCentsToBRL(cents: number | null | undefined): string {
  const safe = Number.isFinite(cents) ? (cents as number) : 0
  return currencyFormatter.format(safe / 100)
}

/** Formata um percentual (0-100+) para exibição, sempre finito e não-negativo. */
export function formatPercent(value: number | null | undefined): string {
  const safe = Number.isFinite(value) ? Math.max(0, value as number) : 0
  return `${numberFormatter.format(Math.round(safe))}%`
}

/** Converte uma string digitada pelo usuário (ex: "1.234,56" ou "123456") em centavos inteiros. */
export function parseBRLToCents(input: string): number {
  const digitsOnly = input.replace(/\D/g, '')
  if (!digitsOnly) return 0
  return parseInt(digitsOnly, 10)
}

/** Formata centavos como string de input mascarado, ex: 123456 -> "1.234,56". */
export function centsToInputValue(cents: number): string {
  const safe = Number.isFinite(cents) ? cents : 0
  return (safe / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  if (!year || !month || !day) return dateStr
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR')
}

/** Formato compacto para listas ("22 set."), sempre visível mesmo se a linha truncar. */
export function formatDateShort(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  if (!year || !month || !day) return dateStr
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export function formatDateLong(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  if (!year || !month || !day) return dateStr
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

/** Desloca uma chave "YYYY-MM" por `delta` meses (negativo = meses anteriores). */
export function shiftMonthKey(key: string, delta: number): string {
  const [year, month] = key.split('-').map(Number)
  const d = new Date(year, month - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function todayISO(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  const local = new Date(now.getTime() - offset * 60000)
  return local.toISOString().slice(0, 10)
}

/** Divisão segura que nunca retorna NaN/Infinity. */
export function safeRatio(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0
  const result = numerator / denominator
  return Number.isFinite(result) ? result : 0
}
