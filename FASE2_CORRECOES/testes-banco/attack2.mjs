import { setup } from './h.mjs'
const {db,as,tryq,A,B} = await setup()
for (const col of ["paid_until = now()+interval '10 years'","is_lifetime = true","billing_status='active'","plan_id='premium'","role='admin'","full_name='x'","billing_subscription_id='x'"]) {
  const r = await tryq(A, `update profiles set ${col} where id='${A}'`)
  console.log(col.padEnd(40), r.ok?'PERMITIDO':'bloqueado: '+r.err.slice(0,50))
}
const r = await db.query(`select plan_id,paid_until,is_lifetime from profiles where id='${A}'`); console.log(r.rows[0])
// RLS entre usuarios
console.log('A lê perfil de B:', (await as(A,`select id from profiles where id='${B}'`)).rows.length)
console.log('A atualiza perfil de B:', (await as(A,`update profiles set full_name='h' where id='${B}' returning id`)).rows.length)
