/** Cor do valor: positivo = verde, negativo = vermelho, zero = neutro (nunca depende da cor de destaque escolhida). */
export function moneyTone(cents: number): string {
  if (cents > 0) return 'text-positive'
  if (cents < 0) return 'text-danger'
  return 'text-ink-primary'
}
