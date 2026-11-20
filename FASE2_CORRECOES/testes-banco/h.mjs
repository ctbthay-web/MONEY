import { build } from './load.mjs'
export async function setup(extra=[]) {
  const {db, errs} = await build(26, extra)
  if (errs.length) console.log('SETUP ERRS', errs)
  const A='00000000-0000-0000-0000-00000000000a', B='00000000-0000-0000-0000-00000000000b'
  for (const [id,e] of [[A,'a@t.test'],[B,'b@t.test']]) await db.exec(`insert into auth.users(id,email) values('${id}','${e}')`)
  await db.exec(`update public.profiles set plan_id='start', paid_until=now()+interval '30 days'`)
  const as = async (uid, sql, params) => {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`)
    try { return await db.query(sql, params) } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false);") }
  }
  const tryq = async (uid, sql, params) => { try { const r = await as(uid, sql, params); return {ok:true, r} } catch(e){ return {ok:false, err:e.message} } }
  const acc = {}
  for (const u of [A,B]) { const r = await as(u, `insert into accounts(user_id,name,type) values('${u}','Conta','checking') returning id`); acc[u]=r.rows[0].id }
  return {db, as, tryq, A, B, acc, errs}
}
export const ins = (u,a,extra='') => `insert into transactions(user_id,account_id,type,amount_cents,description${extra?',':''}${extra.split('|')[0]||''}) values('${u}','${a}','expense',100,'t'${extra?',':''}${extra.split('|')[1]||''})`
