import { setup, ins } from './h.mjs'
const {db,as,tryq,A,acc} = await setup(['/tmp/pg/027.sql'])
await as(A, ins(A,acc[A])); const one=(await db.query(`select id from transactions where user_id='${A}'`)).rows[0].id
const r=await tryq(A, `insert into transactions(user_id,account_id,type,amount_cents,description,series_id) values('${A}','${acc[A]}','expense',100,'x','${one}')`)
const n=(await db.query(`select public.tx_used_this_month('${A}') n, count(*)::int l from transactions where user_id='${A}'`)).rows[0]
console.log('SÓ 027: insert aceito?', r.ok, '| linhas', n.l, '| cota usada', n.n, r.ok&&n.n<n.l?'=> BRECHA CONFIRMADA (2 lançamentos contam 1)':'')
