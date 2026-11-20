import { setup, ins } from './h.mjs'
const F='/mnt/user-data/outputs/FASE2/sql/027_fase2_seguranca_cobranca.sql'
const rep=(n,t,ok)=>console.log((ok?'OK  ':'FALHA')+' '+n+' — '+t)
const {db,as,tryq,A,B,acc} = await setup([F])
const loan=(u)=>`insert into loans(user_id,account_id,counterparty,direction,principal_cents,date) values('${u}','${acc[u]}','Fulano','lent',1000,current_date)`
const cats = await as(A,`insert into categories(user_id,name,type) values('${A}','Mercado','expense') returning id`)
const bud=`insert into budgets(user_id,category_id,amount_cents) values('${A}','${cats.rows[0].id}',5000)`
const sch=`insert into notification_schedules(user_id,title,frequency,start_date) values('${A}','x','once',current_date)`
const matrix = [['start',false,false,false],['plus',true,false,false],['pro_plan',true,true,true],['premium',true,true,true]]
for (const [plan,l,b,s] of matrix) {
  await db.exec(`update profiles set plan_id='${plan}' where id='${A}'`)
  await db.exec(`delete from loans; delete from budgets; delete from notification_schedules;`)
  rep('feature '+plan,`empréstimo=${l} orçamento=${b} lembrete=${s}`,
    (await tryq(A,loan(A))).ok===l && (await tryq(A,bud)).ok===b && (await tryq(A,sch)).ok===s)
}
// admin e vitalício
await db.exec(`update profiles set plan_id='start', is_lifetime=true where id='${A}'`); await db.exec('delete from loans')
rep('vitalício','libera tudo',(await tryq(A,loan(A))).ok)
// sem acesso (expirado): paywall barra
await db.exec(`update profiles set is_lifetime=false, paid_until=now()-interval '1 day', plan_id='premium' where id='${A}'`)
rep('expirado','não cria empréstimo mesmo com plan premium',!(await tryq(A,loan(A))).ok)
// B usuário B (start) não faz chamada direta
rep('usuário B (Start) via chamada direta bloqueado',!(await tryq(B,loan(B))).ok)
// delete/reinsert (achado D1)
await db.exec(`update profiles set paid_until=now()+interval '30 days', plan_id='start'`)
let total=0
for (let r=0;r<3;r++){ for(let i=0;i<25;i++){ if((await tryq(B,ins(B,acc[B]))).ok) total++ } await as(B,'delete from transactions') }
console.log('D1 delete+reinsert: lançamentos criados no mês com plano Start (limite 25):', total)
