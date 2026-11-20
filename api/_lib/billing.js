// Helpers das funções de cobrança (a pasta com "_" não vira endpoint na Vercel).
import { createClient } from '@supabase/supabase-js'

export const PLAN_VALUE = 12.9

export function adminClient() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Confere o token de login do usuário (enviado pelo app) e devolve o usuário, ou null.
export async function getUser(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await adminClient().auth.getUser(token)
  return error ? null : data.user
}

export function billingConfigured() {
  return Boolean(process.env.ASAAS_API_KEY && process.env.ASAAS_API_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export async function asaas(path, { method = 'GET', body } = {}) {
  const res = await fetch(process.env.ASAAS_API_URL + path, {
    method,
    headers: { 'Content-Type': 'application/json', access_token: process.env.ASAAS_API_KEY, 'User-Agent': 'money-app' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.errors?.[0]?.description || `Asaas respondeu ${res.status}`)
  return json
}

export function addOneMonth(date) {
  const d = new Date(date)
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d
}

export function isoDay(date) {
  return new Date(date).toISOString().slice(0, 10)
}
