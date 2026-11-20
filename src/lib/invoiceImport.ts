// Leitura de texto/CSV colado de uma fatura de cartão. Cada linha com um valor vira um item;
// a data é lida se existir (dd/mm/aaaa, dd/mm/aa, aaaa-mm-dd ou dd/mm no começo da linha).
export interface ParsedItem {
  date: string
  description: string
  amountCents: number
  /** Valor negativo no arquivo (estorno, crédito ou pagamento): vem desmarcado. */
  credit: boolean
}

const AMOUNT_RE = /-?\s?(?:R\$\s?)?\d{1,3}(?:\.\d{3})*,\d{2}|-?\s?(?:R\$\s?)?\d+[.,]\d{2}(?!\d)/g

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function toCents(raw: string): number {
  const clean = raw.replace(/R\$|\s|-/g, '')
  // "1.234,56" -> 123456 ; "12.34" -> 1234
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean
  return Math.round(parseFloat(normalized) * 100)
}

function guessYear(month: number, today: Date) {
  // Sem ano no texto: compras de meses "à frente" do atual são do ano passado (ex.: dez em janeiro).
  return month > today.getMonth() + 1 ? today.getFullYear() - 1 : today.getFullYear()
}

export interface ParseOptions {
  /**
   * Só aceita linhas que tragam uma data (dd/mm, dd/mm/aaaa, aaaa-mm-dd ou "15 OUT").
   * Usado no PDF: compra de verdade sempre tem data; cabeçalho, resumo, limite, encargos e
   * "pagamento mínimo" também têm valor e viravam itens a mais.
   */
  requireDate?: boolean
  /** PDF: descarta "Pagamento recebido/em …" e saldos (são da fatura anterior, não compras desta). */
  skipPayments?: boolean
}

export function parseInvoiceText(text: string, fallbackDate: string, today = new Date(), opts: ParseOptions = {}): ParsedItem[] {
  const items: ParsedItem[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    // PDFs trazem sinal de menos "tipográfico" (−) e espaços especiais; normaliza antes de ler
    const line = rawLine
      .replace(/[−‒–]\s?(?=R?\$?\s?\d)/g, '-')
      .replace(/[   ]/g, ' ')
      .replace(/[;\t]+/g, ' ')
      .replace(/"/g, ' ')
      .trim()
    if (!line) continue

    const amounts = [...line.matchAll(AMOUNT_RE)]
    if (amounts.length === 0) continue
    const last = amounts[amounts.length - 1]
    const cents = toCents(last[0])
    if (!cents) continue
    const credit = last[0].includes('-')

    let date = fallbackDate
    let rest = line.slice(0, last.index) + ' ' + line.slice((last.index ?? 0) + last[0].length)

    const iso = rest.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
    const full = rest.match(/\b(\d{2})\/(\d{2})\/(\d{4}|\d{2})\b/)
    const short = line.match(/^(\d{2})\/(\d{2})(?![\d/])/)
    // "15 OUT" / "05 set." (formato de várias faturas em PDF)
    const named = line.match(/^(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?(?![a-z])/i)
    if (iso) {
      date = iso[0]
      rest = rest.replace(iso[0], ' ')
    } else if (full) {
      const y = full[3].length === 2 ? 2000 + Number(full[3]) : Number(full[3])
      date = `${y}-${full[2]}-${full[1]}`
      rest = rest.replace(full[0], ' ')
    } else if (short) {
      const m = Number(short[2])
      date = `${guessYear(m, today)}-${short[2]}-${short[1]}`
      rest = rest.replace(short[0], ' ')
    } else if (named) {
      const m = MONTHS_PT.indexOf(named[2].toLowerCase()) + 1
      date = `${guessYear(m, today)}-${String(m).padStart(2, '0')}-${named[1].padStart(2, '0')}`
      rest = rest.replace(named[0], ' ')
    }

    // no PDF a compra começa pela data; data no meio da linha é cabeçalho ("vencimento 07/11/2026 … R$ 500,00")
    if (opts.requireDate && !(short || named || /^(\d{2}\/\d{2}\/(\d{4}|\d{2})|\d{4}-\d{2}-\d{2})\b/.test(line))) continue

    const description = rest.replace(/\s+/g, ' ').replace(/^[-–•\s]+|[-–•\s]+$/g, '')
    if (!description) continue
    if (opts.skipPayments && isPaymentOfPreviousInvoice(description)) continue
    // Linhas de total/resumo não são compras.
    if (/^(total|subtotal|saldo|limite|valor total|valor da fatura|fatura anterior|pagamento minimo|pagamento mínimo|pagamento total)\b/i.test(description)) continue
    items.push({ date, description: description.slice(0, 120), amountCents: cents, credit })
  }
  return items
}

// ---------------------------------------------------------------- PDF: só o miolo "Transações" da fatura

const plain = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Começo da lista de compras ("TRANSAÇÕES DE 11 SET A 10 OUT", "Lançamentos", "Compras e despesas"…). */
const SECTION_START = /^(transacoes|lancamentos|detalhamento (da|de) fatura|compras (e|do|da|no)|despesas (do|no) (periodo|cartao)|movimentacoes)/
/** Fim da lista: a partir daqui vem pagamento, simulação, limite, próximas faturas etc. */
const SECTION_END =
  /^(opcoes de pagamento|formas de pagamento|como pagar|simulacao|simule|parcele (sua|a) fatura|parcelamento da fatura|proximas? faturas?|limite (total|disponivel|de credito)|fique por dentro|informacoes (importantes|adicionais)|encargos (e|de) (juros|financiamento)|taxas e encargos|cet|canais de atendimento|sac|ouvidoria)\b/

/**
 * Recorta do texto do PDF só o trecho das compras da fatura. Depois do primeiro título de "transações" até
 * o primeiro título de pagamento/simulação/limite. Se o PDF não tiver um título reconhecível, devolve tudo
 * (o filtro por data ainda vale).
 */
export function invoiceSectionLines(text: string): string {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((l) => SECTION_START.test(plain(l)))
  if (start < 0) return text
  const out: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    if (SECTION_END.test(plain(lines[i]))) break
    out.push(lines[i])
  }
  return out.join('\n')
}

/** Pagamento da fatura anterior e saldos não são compras desta fatura. */
export function isPaymentOfPreviousInvoice(description: string): boolean {
  return /^(pagamento|pgto|pag\.?|saldo|credito de|valor pago)\b/.test(plain(description))
}

// ---------------------------------------------------------------- compras em 2+ linhas (moeda estrangeira, descrição quebrada)

const STARTS_WITH_DATE = /^(\d{2}\/\d{2}(\/\d{2,4})?|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?(?![a-z]))/i
const ANY_AMOUNT = /-?\s?(?:R\$\s?)?\d{1,3}(?:\.\d{3})*,\d{2}|-?\s?(?:R\$\s?)?\d+[.,]\d{2}(?!\d)/
const BRL_AMOUNT = /-?\s?R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}/g
const USD_AMOUNT = /U\$\s?(\d{1,3}(?:\.\d{3})*,\d{2})/i
const BLOCK_END = /^(total|subtotal|saldo|limite|valor total|valor da fatura|fatura anterior|pagamento minimo|pagamento total)\b/

/**
 * Em várias faturas a compra em moeda estrangeira ocupa duas linhas: "16 OUT ANTHROPIC* CLAUDE SU" (sem valor) e,
 * logo abaixo, "R$ 110,00  U$ 21,84  V.DOL 5,0366" (o valor em reais fica numa linha própria ou na coluna da direita).
 * Esta função cola essas linhas numa só — "16 OUT ANTHROPIC* CLAUDE SU (US$ 21,84) R$ 110,00" — antes do parser.
 * O valor usado é o último "R$" encontrado nas linhas de continuação; o valor em dólar vira só uma observação na descrição.
 */
export function mergeMultilineItems(text: string): string {
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/[−‒–]\s?(?=R?\$?\s?\d)/g, '-').replace(/[   ]/g, ' ').trim()
    if (STARTS_WITH_DATE.test(line) && !ANY_AMOUNT.test(line)) {
      let j = i + 1
      let brl: string | null = null
      let usd: string | null = null
      while (j < lines.length) {
        const next = lines[j].replace(/[−‒–]\s?(?=R?\$?\s?\d)/g, '-').replace(/[   ]/g, ' ').trim()
        if (!next || STARTS_WITH_DATE.test(next) || BLOCK_END.test(plain(next)) || SECTION_END.test(plain(next))) break
        const reais = next.match(BRL_AMOUNT)
        if (reais) brl = reais[reais.length - 1].replace(/\s+/g, ' ').trim()
        const dollars = next.match(USD_AMOUNT)
        if (dollars) usd = dollars[1]
        j++
      }
      if (brl) {
        out.push(`${line}${usd ? ` (US$ ${usd})` : ''} ${brl}`)
        i = j - 1
        continue
      }
    }
    out.push(lines[i])
  }
  return out.join('\n')
}
