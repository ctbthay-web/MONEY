// "Manter conectado": quem NÃO marca a caixinha no login é desconectado depois de IDLE_LIMIT_MS sem usar o app
// (conferido ao abrir o app, ao voltar para a aba e a cada minuto). Quem marca, ou entrou antes desta opção existir
// (sem a marca salva), continua conectado como sempre. Tudo fica no aparelho; o login em si é do Supabase.
const KEY_REMEMBER = 'money.remember'
const KEY_LAST = 'money.lastActive'
const KEY_REASON = 'money.logoutReason'
export const IDLE_LIMIT_MS = 30 * 60 * 1000
export const IDLE_LIMIT_MIN = IDLE_LIMIT_MS / 60000

function read(store: Storage, k: string) {
  try {
    return store.getItem(k)
  } catch {
    return null
  }
}
function write(store: Storage, k: string, v: string | null) {
  try {
    if (v === null) store.removeItem(k)
    else store.setItem(k, v)
  } catch {
    /* armazenamento bloqueado: segue sem a regra */
  }
}

export function setRemember(remember: boolean) {
  write(localStorage, KEY_REMEMBER, remember ? '1' : '0')
  markActive(true)
}

export function isRemembered() {
  return read(localStorage, KEY_REMEMBER) !== '0'
}

/** Registra uso agora (no máximo a cada 15 s, para não gravar a cada toque). */
export function markActive(force = false) {
  const now = Date.now()
  const last = Number(read(localStorage, KEY_LAST) || 0)
  if (force || now - last > 15_000) write(localStorage, KEY_LAST, String(now))
}

export function isIdleExpired() {
  if (isRemembered()) return false
  const last = Number(read(localStorage, KEY_LAST) || 0)
  return !last || Date.now() - last > IDLE_LIMIT_MS
}

export function clearSessionPolicy() {
  write(localStorage, KEY_REMEMBER, null)
  write(localStorage, KEY_LAST, null)
}

export function setLogoutReason(reason: 'idle') {
  write(sessionStorage, KEY_REASON, reason)
}

/** Lê e apaga o motivo da última saída automática (para avisar uma vez na tela de login). */
export function takeLogoutReason(): 'idle' | null {
  const r = read(sessionStorage, KEY_REASON)
  write(sessionStorage, KEY_REASON, null)
  return r === 'idle' ? 'idle' : null
}
