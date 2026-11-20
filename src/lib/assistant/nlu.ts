// Entendimento de perguntas em português, 100% local e determinístico (sem IA generativa, sem custo).
// Faz três coisas: normaliza o texto, descobre o PERÍODO ("mês passado", "em março"...) e a INTENÇÃO.

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9$%\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate()

export function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
}

export interface Period {
  from: string
  to: string
  label: string
  /** período anterior de mesmo tamanho, para comparação (quando faz sentido) */
  previous?: { from: string; to: string; label: string }
  /** true quando a pessoa não disse período e usamos "este mês" por padrão */
  isDefault?: boolean
}

const MONTHS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const MONTH_LABEL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function monthPeriod(y: number, m: number, label?: string): Period {
  const py = m === 1 ? y - 1 : y
  const pm = m === 1 ? 12 : m - 1
  return {
    from: iso(y, m, 1),
    to: iso(y, m, lastDay(y, m)),
    label: label ?? `${MONTH_LABEL[m - 1]} de ${y}`,
    previous: { from: iso(py, pm, 1), to: iso(py, pm, lastDay(py, pm)), label: MONTH_LABEL[pm - 1] },
  }
}

export function parsePeriod(q: string, today: string): Period {
  const [y, m] = today.split('-').map(Number)
  const has = (re: RegExp) => re.test(q)

  if (has(/\bhoje\b/)) return { from: today, to: today, label: 'hoje' }
  if (has(/\bontem\b/)) {
    const d = addDaysISO(today, -1)
    return { from: d, to: d, label: 'ontem' }
  }
  if (has(/semana (passada|anterior)/)) {
    const to = addDaysISO(today, -7)
    return { from: addDaysISO(to, -6), to, label: 'na semana passada' }
  }
  if (has(/\b(esta|essa|nesta|nessa) semana\b|\bsemana\b/)) {
    return {
      from: addDaysISO(today, -6),
      to: today,
      label: 'nos últimos 7 dias',
      previous: { from: addDaysISO(today, -13), to: addDaysISO(today, -7), label: 'nos 7 dias anteriores' },
    }
  }
  if (has(/mes (passado|anterior)|ultimo mes/)) {
    const pm = m === 1 ? 12 : m - 1
    const py = m === 1 ? y - 1 : y
    return { ...monthPeriod(py, pm, `em ${MONTH_LABEL[pm - 1]}`) }
  }
  if (has(/proximo mes|mes que vem/)) {
    const nm = m === 12 ? 1 : m + 1
    const ny = m === 12 ? y + 1 : y
    return { ...monthPeriod(ny, nm, `em ${MONTH_LABEL[nm - 1]}`) }
  }
  const lastN = q.match(/ultimos? (\d{1,2}) mes(?:es)?/)
  if (lastN) {
    const n = Math.min(24, Math.max(1, Number(lastN[1])))
    const start = new Date(y, m - 1 - (n - 1), 1)
    return { from: iso(start.getFullYear(), start.getMonth() + 1, 1), to: today, label: `nos últimos ${n} meses` }
  }
  if (has(/este ano|esse ano|neste ano|nesse ano|no ano/)) {
    return { from: iso(y, 1, 1), to: today, label: `em ${y}` }
  }
  for (let i = 0; i < 12; i++) {
    if (new RegExp(`\\b${MONTHS[i]}\\b`).test(q)) {
      const explicit = q.match(new RegExp(`${MONTHS[i]}(?: de)? (20\\d{2})`))
      const year = explicit ? Number(explicit[1]) : i + 1 > m ? y - 1 : y
      return monthPeriod(year, i + 1, `em ${MONTH_LABEL[i]}${year !== y ? ` de ${year}` : ''}`)
    }
  }
  const cur = monthPeriod(y, m, 'neste mês')
  return { ...cur, isDefault: true }
}

export type Intent =
  | 'help'
  | 'forecast'
  | 'budget'
  | 'explain'
  | 'health'
  | 'plan'
  | 'reserve'
  | 'goal_plan'
  | 'overspend'
  | 'pay_or_save'
  | 'afford'
  | 'daily'
  | 'compare'
  | 'why_spent'
  | 'average'
  | 'recurring'
  | 'biggest'
  | 'card'
  | 'loans'
  | 'goals'
  | 'due'
  | 'receivable'
  | 'income'
  | 'top_expenses'
  | 'expenses'
  | 'savings'
  | 'balance'
  | 'summary'
  | 'tips'
  | 'unknown'

const RULES: { intent: Intent; test: RegExp }[] = [
  { intent: 'pay_or_save', test: /(pagar|quitar|antecipar).{0,30}\bou\b.{0,30}(guardar|investir|poupar|reserva)|(guardar|investir|poupar).{0,30}\bou\b.{0,30}(pagar|quitar)|devo (pagar|quitar|investir|guardar)|vale a pena (pagar|quitar|antecipar)|pagar divida|sair das dividas/ },
  { intent: 'plan', test: /o que (eu )?(devo|preciso|posso|tenho que) fazer|plano de acao|por onde (eu )?(comec|inici)|como (eu )?(saio|sair|organizo|organizar|melhoro|melhorar|resolvo|resolver|equilibro|equilibrar|me organizar)|me ajuda a (organizar|sair|economizar|melhorar)|o que priorizar|qual a prioridade|prioridade/ },
  { intent: 'health', test: /saude financeira|diagnostico|como (eu )?estou (financeiramente|de dinheiro|de grana|de financas)|minha situacao financeira|estou (bem|mal|ok) (financeiramente|de dinheiro|de grana)|avalia(r|cao)? (minhas )?(financas|dinheiro)|check ?up|nota financeira/ },
  { intent: 'reserve', test: /reserva de emergencia|fundo de emergencia|colchao|reserva de seguranca|emergencia/ },
  { intent: 'goal_plan', test: /^(?!.*\bquanto (eu )?tenho\b)(.*(quanto|quando|em quanto tempo).{0,40}\b(junt|guard|poup|economiz)(ar|o|e|ando)\b|.*\b(junt|guard|poup)(ar|ando)\b \d|.*quero (juntar|guardar|poupar)|.*quanto (preciso |devo |tenho que )?(guardar|poupar|juntar))/ },
  { intent: 'overspend', test: /gastando (demais|muito|mais)|gasto (demais|muito)|gastei demais|controlar (meus )?gastos|exagerando|gasto (mais|alem) do que (ganho|recebo)|vivendo acima/ },
  { intent: 'help', test: /^(oi|ola|opa|e ai|hey|bom dia|boa tarde|boa noite)\b.{0,20}$|\bajuda\b|o que (voce|vc) (faz|sabe|pode)|como (voce|vc) (funciona|pode me ajudar)|^(menu|comandos)$/ },
  { intent: 'afford', test: /(posso|consigo|da pra|da para|tenho como|cabe no|vale a pena).{0,30}(compr|gast|pagar|parcel|fazer|trocar|viaj|assin|invest)|posso (comprar|gastar)|se eu (comprar|gastar|pagar|parcelar)/ },
  { intent: 'daily', test: /por dia|diari|quanto (eu )?(posso|devo|da pra) gastar|limite diario|gastar por dia/ },
  { intent: 'why_spent', test: /por ?que (eu )?(gastei|gasto|estou gastando|aumentou|subiu)|gastei tanto|gastando muito|o que (mais )?(aumentou|subiu|pesou|mudou)|aonde foi (o )?(meu )?dinheiro/ },
  { intent: 'forecast', test: /vermelho|negativ|previs|projec|fim do mes|final do mes|quanto vai sobrar|vai sobrar|vai faltar|sobrar ate|ficar sem dinheiro/ },
  { intent: 'budget', test: /orcamento|estour|limite de gasto|dentro do limite/ },
  { intent: 'explain', test: /(nao|n) (fechou|fecha|fechando|bateu|bate|confere|zerou|quitou)|nao consegui fechar|por ?que.*(fatura|cartao|saldo|conta|aberto|negativ|diferen|baix|nao fech)|entender.*(fatura|cartao|saldo|mes|conta|fechamento)|(qual|ha) (a )?diferenca|explica.*(fatura|saldo|mes|cartao)/ },
  { intent: 'card', test: /fatura|cartao|cartoes|limite do cartao/ },
  { intent: 'recurring', test: /assinatur|recorrent|gastos? fixos?|despesas? fixas?|parcela|parcelad|prestac|quantas parcelas/ },
  { intent: 'loans', test: /emprest|me devem|me deve|devendo|quem me deve|fiado|a quem devo/ },
  { intent: 'goals', test: /\bmetas?\b|reservas?\b|objetivo|sonho/ },
  { intent: 'receivable', test: /a receber|vou receber|recebimentos? (pendente|previsto|futuro)|o que (falta|tenho) receber/ },
  { intent: 'due', test: /vence|vencer|vencimento|a pagar|contas? (para|pra) pagar|atrasad|em aberto|pendente|o que (falta|tenho) pagar|preciso pagar|proxim[ao]s? (conta|pagamento)/ },
  { intent: 'biggest', test: /maior (compra|despesa|lancamento|receita|entrada)|compra mais cara|mais caro|gasto mais alto|maior valor/ },
  { intent: 'compare', test: /compar|mais (do )?que (no |em )?mes passado|menos (do )?que (no |em )?mes passado|aumentou|diminuiu|evolu|melhorei|piorei|gastei mais ou menos/ },
  { intent: 'average', test: /\bmedia\b|em media|costumo gastar|normalmente|geralmente|em geral|gasto por mes|gasto mensal/ },
  { intent: 'top_expenses', test: /onde mais gasto|maiores? gastos?|maior gasto|principais gastos|em que (eu )?gasto|categoria que mais|mais gastei|para onde (vai|foi) (meu )?dinheiro/ },
  { intent: 'income', test: /recebi|receita|ganhei|entrou|entradas?|renda|salario|quanto ganho/ },
  { intent: 'expenses', test: /gastei|gasto|gastos|despesa|saiu|paguei|quanto foi|quanto custou|quanto gasto/ },
  { intent: 'savings', test: /economi|poupei|sobrou|taxa de poupanca|estou guardando/ },
  { intent: 'balance', test: /saldo|quanto tenho|dinheiro disponivel|minhas contas|quanto (eu )?tenho/ },
  { intent: 'summary', test: /resumo|como (esta|ta|estou|foi) (meu|o) mes|como estou|situacao|panorama|visao geral|balanco/ },
  { intent: 'tips', test: /dica|recomend|conselho|como economizar|melhorar|o que (eu )?fazer|devo cortar|onde cortar|analise/ },
]

export function detectIntent(q: string): Intent {
  for (const r of RULES) if (r.test.test(q)) return r.intent
  return 'unknown'
}

const STOP = new Set([
  'quanto', 'gastei', 'gasto', 'gastos', 'paguei', 'recebi', 'com', 'em', 'no', 'na', 'nos', 'nas', 'de', 'do', 'da', 'dos', 'das', 'o', 'a', 'os', 'as',
  'meu', 'minha', 'meus', 'minhas', 'mes', 'este', 'esse', 'esta', 'essa', 'passado', 'anterior', 'foi', 'fui', 'eu', 'para', 'pra', 'por', 'um', 'uma',
  'que', 'qual', 'quais', 'como', 'esta', 'estou', 'hoje', 'ontem', 'semana', 'ano', 'despesa', 'despesas', 'receita', 'receitas', 'total', 'quero', 'saber',
  'mostre', 'mostra', 'me', 'diga', 'ultimos', 'ultimo', 'meses', 'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro',
  'outubro', 'novembro', 'dezembro', 'ja', 'tenho', 'valor', 'saiu', 'entrou', 'categoria', 'conta', 'contas', 'foram', 'teve', 'tive',
])

/** Palavras "de assunto" da pergunta (sobram depois de tirar período e termos genéricos). */
export function topicWords(q: string): string[] {
  return q
    .split(' ')
    .filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w))
    .map((w) => (w.length > 5 && w.endsWith('s') ? w.slice(0, -1) : w))
}

// ---------------------------------------------------------------- tolerância a erros de digitação

const VOCAB = [
  'saldo', 'gastei', 'gastos', 'gasto', 'despesa', 'despesas', 'receita', 'receitas', 'recebi', 'ganhei', 'fatura', 'cartao', 'cartoes',
  'vence', 'vencer', 'vencimento', 'vencimentos', 'atrasado', 'atrasada', 'atrasados', 'orcamento', 'emprestimo', 'emprestimos', 'metas',
  'reserva', 'reservas', 'previsao', 'vermelho', 'negativo', 'economia', 'economizar', 'economizei', 'media', 'comparar', 'compara',
  'assinatura', 'assinaturas', 'parcela', 'parcelas', 'parcelado', 'parcelada', 'recorrente', 'recorrentes', 'dica', 'dicas', 'resumo',
  'mercado', 'transporte', 'lazer', 'salario', 'aluguel', 'internet', 'comprar', 'comprei', 'compra', 'compras', 'pagar', 'paguei',
  'pagamento', 'quanto', 'quando', 'porque', 'explicar', 'entender', 'fechou', 'fechar', 'conta', 'contas', 'mensal', 'semana', 'diario',
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  'passado', 'anterior', 'proximo', 'ultimos', 'maior', 'maiores', 'menor', 'dinheiro', 'disponivel', 'sobrou', 'sobrar', 'estourei',
  'saude', 'financeira', 'financeiro', 'financeiramente', 'emergencia', 'juntar', 'guardar', 'poupar', 'investir', 'quitar', 'diagnostico', 'prioridade', 'organizar', 'dividas', 'divida', 'demais',
  'limite', 'devendo', 'devem', 'emprestei', 'situacao', 'panorama', 'analise', 'analisar', 'aumentou', 'diminuiu', 'subiu', 'caiu',
]
const VOCAB_SET = new Set(VOCAB)

/** Distância de edição (inserir/apagar/trocar/inverter letras vizinhas); devolve max+1 se passar do limite. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const d: number[][] = []
  for (let i = 0; i <= a.length; i++) {
    d[i] = []
    for (let j = 0; j <= b.length; j++) {
      if (i === 0) d[i][j] = j
      else if (j === 0) d[i][j] = i
      else {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1
        let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1)
        d[i][j] = v
      }
    }
  }
  return Math.min(d[a.length][b.length], max + 1)
}

/** Corrige palavras com erro de digitação ("gatsei", "ventimento") usando o vocabulário do assistente e os nomes do usuário. */
export function fixTypos(q: string, extraWords: string[] = []): string {
  const extra = extraWords.map((w) => normalize(w)).filter((w) => w.length >= 3)
  const known = new Set([...VOCAB_SET, ...extra])
  const pool = [...VOCAB, ...extra.filter((w) => w.length >= 5)]
  return q
    .split(' ')
    .map((w) => {
      if (w.length < 6 || known.has(w) || /\d/.test(w)) return w
      const max = w.length >= 8 ? 2 : 1
      let best = w
      let bestD = max + 1
      for (const v of pool) {
        if (v[0] !== w[0]) continue
        const dist = editDistance(w, v, max)
        if (dist < bestD) {
          bestD = dist
          best = v
        }
      }
      return bestD <= max ? best : w
    })
    .join(' ')
}

/** Tira do texto as expressões de período (para reaproveitar o assunto de uma pergunta anterior). */
export function stripPeriod(q: string): string {
  return q
    .replace(/\b(hoje|ontem|semana passada|esta semana|essa semana|nesta semana|nessa semana|mes passado|mes anterior|ultimo mes|proximo mes|mes que vem|este mes|esse mes|neste mes|nesse mes|este ano|esse ano|neste ano|nesse ano)\b/g, ' ')
    .replace(/\bultimos? \d{1,2} mes(es)?\b/g, ' ')
    .replace(/\b(em )?(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)( de 20\d{2})?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Pergunta curta de continuação, tipo "e no mês passado?" ou "e de transporte?". */
export function isFollowUp(q: string): boolean {
  return q.split(' ').length <= 6 && /^(e|e se|mas|entao|tambem|agora|e agora)\b/.test(q)
}

/** Primeiro valor em reais citado ("R$ 1.500,50", "500 reais", "2 mil"); null se não houver. */
export function parseAmountCents(raw: string): number | null {
  const t = raw.toLowerCase()
  const mil = t.match(/(\d+(?:[.,]\d+)?)\s*(mil|k)\b/)
  if (mil) return Math.round(Number(mil[1].replace(',', '.')) * 1000 * 100)
  const hasMoney = /r\$|reais|\breal\b/.test(t)
  const found = t.match(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?/g)
  if (!found) return null
  for (const s of found) {
    const [intPart, dec = ''] = s.split(',')
    const n = Number(intPart.replace(/\./g, ''))
    if (n >= 20 && n < 100000000 && (hasMoney || !/^20\d\d$/.test(intPart))) return n * 100 + Number((dec + '00').slice(0, 2))
  }
  return null
}
