/** Credenciais SEMPRE via variáveis de ambiente (nunca no código). Usuários descartáveis de um projeto Supabase de TESTE. */
export const USER_A = { email: process.env.TEST_USER_A_EMAIL ?? '', password: process.env.TEST_USER_A_PASSWORD ?? '' }
export const USER_B = { email: process.env.TEST_USER_B_EMAIL ?? '', password: process.env.TEST_USER_B_PASSWORD ?? '' }
export const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? ''
export const SUPABASE_ANON = process.env.TEST_SUPABASE_ANON_KEY ?? ''
export const hasUserA = Boolean(USER_A.email && USER_A.password)
export const hasTwoUsers = hasUserA && Boolean(USER_B.email && USER_B.password)
export const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON)
export const NEEDS_ENV = 'Não executado: defina TEST_USER_A_EMAIL/PASSWORD (usuário descartável em projeto Supabase de TESTE).'
