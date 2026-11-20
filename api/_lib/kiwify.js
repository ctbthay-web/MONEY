// Helpers da API pública da Kiwify (https://docs.kiwify.com.br), usados por billing-sync e billing-refund.
// Credenciais (Vercel): client_id, client_secret, account_id (ou KIWIFY_CLIENT_ID / KIWIFY_CLIENT_SECRET / KIWIFY_ACCOUNT_ID).

export const API = 'https://public-api.kiwify.com/v1'

export function credentials() {
  const env = process.env
  const clientId = env.KIWIFY_CLIENT_ID || env.client_id
  const clientSecret = env.KIWIFY_CLIENT_SECRET || env.client_secret
  const accountId = env.KIWIFY_ACCOUNT_ID || env.account_id
  return clientId && clientSecret && accountId ? { clientId, clientSecret, accountId } : null
}

export async function accessToken({ clientId, clientSecret }) {
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.access_token) throw new Error(`oauth ${res.status}`)
  return json.access_token
}

export function authHeaders(creds, token) {
  return { Authorization: `Bearer ${token}`, 'x-kiwify-account-id': creds.accountId }
}

// a API não filtra por e-mail: lista as vendas dos últimos dias (no máximo 90) e filtramos aqui
function kiwifyDate(d) {
  return d.toISOString().replace('T', ' ').replace('Z', '')
}

export async function listSales(creds, token) {
  const end = new Date()
  const start = new Date(end.getTime() - 85 * 86_400_000)
  const sales = []
  for (let page = 1; page <= 5; page++) {
    const qs = new URLSearchParams({
      start_date: kiwifyDate(start),
      end_date: kiwifyDate(end),
      view_full_sale_details: 'true',
      page_size: '100',
      page_number: String(page),
    })
    const res = await fetch(`${API}/sales?${qs}`, { headers: authHeaders(creds, token) })
    if (!res.ok) throw new Error(`sales ${res.status}`)
    const json = await res.json()
    const data = Array.isArray(json?.data) ? json.data : []
    sales.push(...data)
    if (data.length < 100) break
  }
  return sales
}

// o detalhe de UMA venda traz product.plan_name (ex.: "START"); a lista pode não trazer
export async function saleDetail(creds, token, id) {
  const res = await fetch(`${API}/sales/${id}`, { headers: authHeaders(creds, token) })
  return res.ok ? res.json().catch(() => null) : null
}

/** Vendas desta conta: o id da conta (s1) manda; sem s1, vale o e-mail. Venda com s1 de OUTRA conta nunca entra. */
export function salesOfUser(sales, user) {
  const email = String(user.email || '').trim().toLowerCase()
  return sales.filter((s) => {
    const s1 = String(s?.tracking?.s1 || '').trim().toLowerCase()
    if (s1) return s1 === user.id.toLowerCase()
    return Boolean(email) && String(s?.customer?.email || '').trim().toLowerCase() === email
  })
}

export const saleTime = (s) => new Date(s?.approved_date || s?.created_at || 0).getTime()
