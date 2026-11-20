// Medição própria do funil e dos erros (tabela app_events, sql/030). Sem serviço externo e sem cookies de terceiros:
// só um identificador aleatório do visitante guardado no navegador. Nunca envia nome, e-mail, valores ou dados
// financeiros. Respeita "Não rastrear" do navegador. Qualquer falha é ignorada: medir nunca pode quebrar o app.
import { supabase } from './supabase'

export type EventKind = 'page' | 'funnel' | 'error'

const ANON_KEY = 'money.anonId'

function anonId(): string | null {
  try {
    let v = localStorage.getItem(ANON_KEY)
    if (!v) {
      v = crypto.randomUUID()
      localStorage.setItem(ANON_KEY, v)
    }
    return v
  } catch {
    return null
  }
}

function blocked(): boolean {
  try {
    return typeof navigator !== 'undefined' && navigator.doNotTrack === '1'
  } catch {
    return false
  }
}

export function track(kind: EventKind, name: string, extra: { planId?: string | null; meta?: Record<string, unknown> } = {}) {
  if (blocked()) return
  void (async () => {
    try {
      const row = {
        kind,
        name: name.slice(0, 60),
        anon_id: anonId(),
        path: typeof location !== 'undefined' ? location.pathname.slice(0, 200) : null,
        plan_id: extra.planId ? String(extra.planId).slice(0, 20) : null,
        meta: extra.meta ?? null,
      }
      await supabase.from('app_events').insert(row)
    } catch {
      /* medir nunca quebra o app */
    }
  })()
}

/** Evento de visita/funil que só conta uma vez por aba (não repete ao recarregar ou re-renderizar). */
export function trackOnce(kind: EventKind, name: string, extra: { planId?: string | null; meta?: Record<string, unknown> } = {}) {
  try {
    const key = `money.ev.${name}.${extra.planId ?? ''}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
  } catch {
    /* sem sessionStorage: conta de novo, sem problema */
  }
  track(kind, name, extra)
}

// ---------------------------------------------------------------- erros de tela

const IGNORED = /ResizeObserver loop|^Script error\.?$|Non-Error promise rejection|chrome-extension|moz-extension/i
let errorsSent = 0
const seen = new Set<string>()

function report(name: string, message: string, extra: Record<string, unknown> = {}) {
  const msg = String(message || '').slice(0, 300)
  if (!msg || IGNORED.test(msg) || errorsSent >= 5 || seen.has(msg)) return
  seen.add(msg)
  errorsSent++
  track('error', name, { meta: { message: msg, ...extra } })
}

/** Registra erros não tratados (máximo de 5 por aba, sem repetir a mesma mensagem). Chamar uma vez na inicialização. */
export function installErrorTracking() {
  if (typeof window === 'undefined') return
  window.addEventListener('error', (e) => {
    report('js_error', e.message, { source: String(e.filename || '').slice(0, 150), line: e.lineno })
  })
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    report('promise_rejection', reason instanceof Error ? reason.message : String(reason ?? ''))
  })
}
