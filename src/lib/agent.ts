export const AGENT_NAME_MIN = 2
export const AGENT_NAME_MAX = 20

// mesma regra do banco (sql/025): começa com letra; depois letras, espaço, ponto, hífen ou apóstrofo
const VALID = /^\p{L}[\p{L} .'-]*$/u

/** Limpa o que a pessoa digitou: tira espaços das pontas e junta espaços repetidos. */
export function normalizeAgentName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/** Devolve a mensagem de erro em português, ou null se o nome é válido. */
export function validateAgentName(raw: string): string | null {
  const name = normalizeAgentName(raw)
  if (name.length < AGENT_NAME_MIN) return `Use pelo menos ${AGENT_NAME_MIN} letras.`
  if (name.length > AGENT_NAME_MAX) return `Use no máximo ${AGENT_NAME_MAX} caracteres.`
  if (!VALID.test(name)) return 'Use só letras (pode ter espaço, ponto, hífen ou apóstrofo).'
  return null
}

/** Apresentação da assistente. O nome vem sempre do perfil do usuário, nunca de texto gerado pela IA. */
export function agentIntro(name: string): string {
  return `Olá! Sou a ${name}, sua assistente financeira. Estou aqui para ajudar você a entender melhor seu dinheiro, organizar suas finanças e tomar decisões mais inteligentes. O que vamos analisar hoje?`
}
