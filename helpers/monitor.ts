import type { Page } from '@playwright/test'

export interface Findings { console: string[]; pageErrors: string[]; failedRequests: string[]; badResponses: string[] }

/** Registra erros de console, exceções JS, requisições falhas e respostas 4xx/5xx (exceto 401/403 esperados). */
export function monitor(page: Page): Findings {
  const f: Findings = { console: [], pageErrors: [], failedRequests: [], badResponses: [] }
  page.on('console', (m) => { if (m.type() === 'error') f.console.push(m.text()) })
  page.on('pageerror', (e) => f.pageErrors.push(e.message))
  page.on('requestfailed', (r) => f.failedRequests.push(`${r.method()} ${r.url()} ${r.failure()?.errorText ?? ''}`))
  page.on('response', (r) => { if (r.status() >= 500) f.badResponses.push(`${r.status()} ${r.url()}`) })
  return f
}
