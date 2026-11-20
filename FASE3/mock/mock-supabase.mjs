// Supabase SIMULADO (só para testar o comportamento da interface). NÃO é integração real.
import http from 'node:http'
const flags = { tokenDown: false, profileFail: false, profileDelay: 0, expireRefresh: false, expiresIn: 3600, profileMissing: false, recoverFail: false }
const calls = []
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (sub, email, exp) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, email, role: 'authenticated', aud: 'authenticated', exp })}.sig`
const U = { id: '00000000-0000-0000-0000-00000000000a', email: 'a@t.test' }
const session = () => {
  const exp = Math.floor(Date.now() / 1000) + flags.expiresIn
  return { access_token: jwt(U.id, U.email, exp), token_type: 'bearer', expires_in: flags.expiresIn, expires_at: exp, refresh_token: 'rt-' + Math.random().toString(36).slice(2),
    user: { id: U.id, aud: 'authenticated', role: 'authenticated', email: U.email, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } }
}
const profile = () => ({ id: U.id, full_name: 'Usuário A', avatar_url: null, role: 'user', plan_id: 'premium', is_active: true, is_lifetime: false,
  trial_ends_at: null, paid_until: new Date(Date.now() + 30 * 864e5).toISOString(), billing_provider: 'kiwify', billing_status: 'active', agent_name: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const h = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*' }
  if (req.method === 'OPTIONS') { res.writeHead(204, h); return res.end() }
  let body = ''; for await (const c of req) body += c
  const json = (code, o, extra = {}) => { res.writeHead(code, { ...h, 'Content-Type': 'application/json', ...extra }); res.end(JSON.stringify(o)) }
  if (url.pathname === '/__ctl') { Object.assign(flags, JSON.parse(body || '{}')); return json(200, flags) }
  if (url.pathname === '/__log') return json(200, calls)
  if (url.pathname === '/__reset') { calls.length = 0; Object.assign(flags, { tokenDown: false, profileFail: false, profileDelay: 0, expireRefresh: false, expiresIn: 3600, profileMissing: false, recoverFail: false }); return json(200, flags) }
  calls.push(req.method + ' ' + url.pathname)
  if (url.pathname === '/auth/v1/token') {
    if (flags.tokenDown) return req.socket.destroy()
    const gt = url.searchParams.get('grant_type'); const p = body ? JSON.parse(body) : {}
    if (gt === 'password') {
      if (p.email === U.email && p.password === 'Senha123!') return json(200, session())
      return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials', error: 'invalid_grant', error_description: 'Invalid login credentials' })
    }
    if (gt === 'refresh_token') {
      if (flags.expireRefresh) return json(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found', error: 'invalid_grant', error_description: 'Invalid Refresh Token: Refresh Token Not Found' })
      return json(200, session())
    }
  }
  if (url.pathname === '/auth/v1/user') return json(200, session().user)
  if (url.pathname === '/auth/v1/logout') { res.writeHead(204, h); return res.end() }
  if (url.pathname === '/auth/v1/recover') return flags.recoverFail ? json(500, { msg: 'erro' }) : json(200, {})
  if (url.pathname === '/rest/v1/profiles') {
    if (flags.profileDelay) await sleep(flags.profileDelay)
    if (flags.profileFail) return json(500, { message: 'falha simulada' })
    if (req.method === 'GET') return json(200, flags.profileMissing ? [] : [profile()])
    return json(200, [profile()])
  }
  if (url.pathname.startsWith('/rest/v1/rpc/')) return json(200, [])
  if (url.pathname.startsWith('/rest/v1/')) return json(req.method === 'GET' ? 200 : 201, [])
  json(404, {})
}).listen(54321, '127.0.0.1', () => console.log('mock supabase em :54321'))
