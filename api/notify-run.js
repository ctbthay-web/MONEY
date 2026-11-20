// GET/POST /api/notify-run — roda no servidor (cron) e envia as notificações push do dia.
// Autenticação: "Authorization: Bearer <CRON_SECRET>" (a Vercel envia sozinha nos crons dela;
// o pg_cron do Supabase envia o mesmo cabeçalho). Cada usuário só recebe as próprias notificações.
import { timingSafeEqual } from 'node:crypto'
import webpush from 'web-push'
import { adminClient } from './_lib/billing.js'
import { brasiliaNow, buildForUser, buildSubscriptionNotices } from './_lib/notifications.js'

const DEFAULT_PREFS = {
  enabled: true,
  notify_due: true,
  notify_receivable: true,
  notify_cards: true,
  notify_goals: true,
  notify_summary: true,
  days_before: 1,
  send_hour: 9,
}

function authorized(req) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const a = Buffer.from(got)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function fetchAll(buildQuery) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await buildQuery().range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}

const by = (rows, key = 'user_id') => {
  const m = new Map()
  for (const r of rows) {
    const l = m.get(r[key]) ?? []
    l.push(r)
    m.set(r[key], l)
  }
  return m
}

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'Não autorizado.' })
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Notificações em configuração.' })
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:contato@money-app-woad.vercel.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )

  const db = adminClient()
  const { today } = brasiliaNow()
  const stats = { users: 0, sent: 0, failed: 0, removed: 0 }

  try {
    const subs = await fetchAll(() => db.from('push_subscriptions').select('*'))
    const subsByUser = by(subs)
    const userIds = [...subsByUser.keys()]
    if (userIds.length === 0) return res.status(200).json({ ok: true, ...stats })

    const prefRows = await fetchAll(() => db.from('notification_preferences').select('*').in('user_id', userIds))
    const prefsByUser = new Map(prefRows.map((p) => [p.user_id, p]))

    // só usuários com conta ativa e acesso (mesma regra do app: has_access)
    const { data: accessRows } = await db
      .from('profiles')
      .select('id, is_active, role, is_lifetime, trial_ends_at, paid_until, billing_status')
      .in('id', userIds)
    const nowIso = new Date().toISOString()
    const active = new Set(
      (accessRows || [])
        .filter(
          (p) =>
            p.is_active &&
            (p.role === 'admin' ||
              p.is_lifetime ||
              (p.trial_ends_at && p.trial_ends_at > nowIso) ||
              (p.paid_until && p.paid_until > nowIso))
        )
        .map((p) => p.id)
    )

    const targets = userIds.filter((id) => active.has(id) && (prefsByUser.get(id) ?? DEFAULT_PREFS).enabled)

    // avisos de assinatura: inclusive quem venceu há poucos dias (esses não recebem os avisos financeiros)
    const subNotices = new Map()
    for (const p of accessRows || []) {
      if (!(prefsByUser.get(p.id) ?? DEFAULT_PREFS).enabled) continue
      const notices = buildSubscriptionNotices(p)
      if (notices.length) subNotices.set(p.id, notices)
    }
    if (targets.length === 0 && subNotices.size === 0) return res.status(200).json({ ok: true, ...stats })

    const dayMs = 86400000
    const horizon = new Date(Date.parse(today + 'T00:00:00Z') + 10 * dayMs).toISOString().slice(0, 10)
    const since = new Date(Date.parse(today + 'T00:00:00Z') - 120 * dayMs).toISOString().slice(0, 10)
    const monthStart = today.slice(0, 7) + '-01'

    const [accounts, openTx, transfers, goals, schedules, budgets, monthExpenses, categories] = await Promise.all([
      fetchAll(() =>
        db.from('accounts').select('id,user_id,name,type,closing_day,due_day,archived').in('user_id', targets).eq('archived', false)
      ),
      fetchAll(() =>
        db
          .from('transactions')
          .select('id,user_id,account_id,type,amount_cents,description,date,due_date,applied_to_balance')
          .in('user_id', targets)
          .eq('applied_to_balance', false)
          .gte('date', since)
          .lte('date', horizon)
      ),
      fetchAll(() =>
        db.from('transfers').select('user_id,to_account_id,invoice_period').in('user_id', targets).not('invoice_period', 'is', null)
      ),
      fetchAll(() =>
        db.from('goals').select('id,user_id,name,target_cents,accumulated_cents,archived,updated_at').in('user_id', targets)
      ),
      fetchAll(() => db.from('notification_schedules').select('*').in('user_id', targets).eq('active', true)),
      // tabela criada na sql/023: se ainda não existir, as demais notificações seguem normais
      fetchAll(() => db.from('budgets').select('id,user_id,category_id,amount_cents').in('user_id', targets)).catch(() => []),
      fetchAll(() =>
        db
          .from('transactions')
          .select('user_id,category_id,amount_cents')
          .in('user_id', targets)
          .eq('type', 'expense')
          .gte('date', monthStart)
          .lte('date', today)
      ),
      fetchAll(() => db.from('categories').select('id,name')),
    ])
    const categoryRows = categories
    const cardIds = accounts.filter((a) => a.type === 'credit_card').map((a) => a.id)
    const cardTx = cardIds.length
      ? await fetchAll(() =>
          db
            .from('transactions')
            .select('id,user_id,account_id,type,amount_cents,description,date')
            .in('account_id', cardIds)
            .eq('type', 'expense')
            .gte('date', since)
            .lte('date', horizon)
        )
      : []
    // resumo do mês só é necessário no último dia do mês
    const tomorrow = new Date(Date.parse(today + 'T00:00:00Z') + dayMs).toISOString().slice(0, 10)
    const monthTx = tomorrow.endsWith('-01')
      ? await fetchAll(() =>
          db
            .from('transactions')
            .select('user_id,type,amount_cents,date')
            .in('user_id', targets)
            .eq('applied_to_balance', true)
            .gte('date', monthStart)
            .lte('date', today)
        )
      : []

    const g = {
      acc: by(accounts),
      tx: by(openTx),
      tr: by(transfers),
      goals: by(goals),
      sch: by(schedules),
      card: by(cardTx),
      month: by(monthTx),
      budgets: by(budgets),
      spent: by(monthExpenses),
    }

    const targetSet = new Set(targets)
    for (const userId of new Set([...targets, ...subNotices.keys()])) {
      stats.users++
      const prefs = { ...DEFAULT_PREFS, ...(prefsByUser.get(userId) ?? {}) }
      const financial = !targetSet.has(userId) ? [] : buildForUser({
        prefs,
        data: {
          accounts: g.acc.get(userId) ?? [],
          transactions: g.tx.get(userId) ?? [],
          cardTransactions: g.card.get(userId) ?? [],
          transfers: g.tr.get(userId) ?? [],
          goals: g.goals.get(userId) ?? [],
          monthTransactions: g.month.get(userId) ?? [],
          schedules: g.sch.get(userId) ?? [],
          budgets: g.budgets.get(userId) ?? [],
          monthExpenses: g.spent.get(userId) ?? [],
          categories: categoryRows,
        },
      })
      const items = [...(subNotices.get(userId) ?? []), ...financial]
      if (items.length === 0) continue

      // grava no histórico; a chave única (user_id, dedupe_key) impede enviar a mesma de novo
      const { data: fresh, error } = await db
        .from('notification_log')
        .upsert(
          items.map((i) => ({
            user_id: userId,
            kind: i.kind,
            dedupe_key: i.dedupe_key,
            title: i.title,
            body: i.body,
            url: i.url,
          })),
          { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true }
        )
        .select('dedupe_key')
      if (error) throw new Error(error.message)
      const freshKeys = new Set((fresh || []).map((r) => r.dedupe_key))

      for (const item of items.filter((i) => freshKeys.has(i.dedupe_key))) {
        const payload = JSON.stringify({
          title: item.title,
          body: item.body,
          url: item.url,
          kind: item.kind,
          level: item.level,
          tag: item.dedupe_key,
        })
        for (const sub of subsByUser.get(userId) ?? []) {
          try {
            await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
              TTL: 60 * 60 * 24,
              urgency: item.level === 'alert' ? 'high' : 'normal',
            })
            stats.sent++
          } catch (err) {
            if (err && (err.statusCode === 404 || err.statusCode === 410)) {
              await db.from('push_subscriptions').delete().eq('id', sub.id)
              stats.removed++
            } else stats.failed++
          }
        }
        if (item.scheduleId) {
          await db
            .from('notification_schedules')
            .update({ last_sent_on: today, ...(item.once ? { active: false } : {}) })
            .eq('id', item.scheduleId)
            .eq('user_id', userId)
        }
      }
    }
    return res.status(200).json({ ok: true, ...stats })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Falha ao enviar.', ...stats })
  }
}
