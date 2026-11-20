/** Formata centavos como o app (pt-BR). Usado nas asserções de valores. */
export const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ')
/** Parse de "R$ 1.234,56" para centavos. */
export const parseBRL = (s: string) => Math.round(Number(s.replace(/[^\d,-]/g, '').replace(',', '.')) * 100)
