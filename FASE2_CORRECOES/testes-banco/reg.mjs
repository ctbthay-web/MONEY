import { setup } from './h.mjs'
import fs from 'fs'
const F=['/mnt/user-data/outputs/FASE2/sql/027_fase2_seguranca_cobranca.sql','/mnt/user-data/outputs/FASE2/sql/027b_OPCIONAL_cota_sem_estorno.sql']
const res=[]; const t=(id,d,ok)=>{res.push({id,d,ok});console.log((ok?'OK   ':'FALHA ')+id+' '+d)}
async function financeiro(extra){
  const {db,as,tryq,A,B,acc}=await setup(extra); await db.exec(`update profiles set plan_id='premium'`)
  const bal=async(id)=>Number((await db.query(`select balance_cents b from accounts where id='${id}'`)).rows[0].b)
  const out={}
  const cc=(await as(A,`insert into accounts(user_id,name,type,closing_day,due_day) values('${A}','Cartão','credit_card',25,5) returning id`)).rows[0].id
  const poup=(await as(A,`insert into accounts(user_id,name,type,balance_cents) values('${A}','Poup','savings',0) returning id`)).rows[0].id
  await as(A,`update accounts set balance_cents=100000 where id='${acc[A]}'`); out.inicial=await bal(acc[A])
  const d=(await as(A,`insert into transactions(user_id,account_id,type,amount_cents,description) values('${A}','${acc[A]}','expense',10000,'desp') returning id`)).rows[0].id
  out.apos_despesa=await bal(acc[A])
  await as(A,`insert into transactions(user_id,account_id,type,amount_cents,description) values('${A}','${acc[A]}','income',5000,'rec')`); out.apos_receita=await bal(acc[A])
  await as(A,`insert into transfers(user_id,from_account_id,to_account_id,amount_cents,date,applied_to_balance) values('${A}','${acc[A]}','${poup}',20000,current_date,true)`)
  out.origem_transf=await bal(acc[A]); out.destino_transf=await bal(poup)
  out.despesas_total=Number((await db.query(`select coalesce(sum(amount_cents),0) s from transactions where type='expense'`)).rows[0].s) // transferência não é despesa
  const rows=Array.from({length:3},(_,i)=>`('${A}','${acc[A]}','expense',1000,'parc ${i+1}/3','33333333-3333-3333-3333-333333333333',current_date+${i*40})`).join(',')
  await as(A,`insert into transactions(user_id,account_id,type,amount_cents,description,series_id,date) values ${rows}`)
  out.apos_parcelas=await bal(acc[A]) // só a 1ª (vencida) aplica
  await as(A,`insert into transactions(user_id,account_id,type,amount_cents,description) values('${A}','${cc}','expense',30000,'compra cartão')`); out.cartao=await bal(cc)
  await as(A,`delete from transactions where id='${d}'`); out.apos_excluir_despesa=await bal(acc[A])
  const loan=(await as(A,`insert into loans(user_id,account_id,counterparty,direction,principal_cents) values('${A}','${acc[A]}','Fulano','borrowed',50000) returning id`)).rows[0].id
  out.apos_emprestimo=await bal(acc[A]); out.receitas_total=Number((await db.query(`select coalesce(sum(amount_cents),0) s from transactions where type='income'`)).rows[0].s)
  await as(A,`insert into loan_payments(loan_id,user_id,amount_cents) values('${loan}','${A}',10000)`); out.apos_pag_emprestimo=await bal(acc[A])
  return {out,db,as,tryq,A,B,acc}
}
const antes=(await financeiro([])).out
const depois=await financeiro(F); const dep=depois.out
console.log('ANTES (migrações 001–026):',JSON.stringify(antes)); console.log('DEPOIS (+027 e 027b):    ',JSON.stringify(dep))
t('REG-01','saldos e regras financeiras idênticos antes e depois da 027/027b',JSON.stringify(antes)===JSON.stringify(dep))
t('REG-03','empréstimo entra/sai do saldo sem virar receita (receitas continuam 5000)',dep.apos_emprestimo-dep.apos_excluir_despesa===50000&&dep.receitas_total===5000&&dep.apos_pag_emprestimo===dep.apos_emprestimo-10000)
t('REG-02','transferência não vira despesa/receita e move origem→destino',dep.destino_transf===20000&&dep.origem_transf===dep.apos_receita-20000)
// ---- isolamento A x B em todas as tabelas ----
const {db,as,tryq,A,B,acc}=depois
await as(A,`insert into goals(user_id,name,target_cents) values('${A}','meta',1000)`)
const cat=(await as(A,`insert into categories(user_id,name,type) values('${A}','C','expense') returning id`)).rows[0].id
await as(A,`insert into budgets(user_id,category_id,amount_cents) values('${A}','${cat}',100)`)
await as(A,`insert into notification_schedules(user_id,title,frequency,start_date) values('${A}','x','once',current_date)`)
await as(A,`insert into ai_conversations(user_id) values('${A}')`)
let iso=true; const det=[]
for (const tb of ['accounts','transactions','transfers','loans','loan_payments','goals','categories','budgets','notification_schedules','ai_conversations','profiles']) {
  const k = tb==='profiles'?'id':'user_id'
  const n=(await as(B,`select * from ${tb} where ${k}='${A}'`)).rows.length
  const u=(await tryq(B,`update ${tb} set created_at=created_at where ${k}='${A}' returning 1`)); const un=u.ok?u.r.rows.length:0
  const dl=(await tryq(B,`delete from ${tb} where ${k}='${A}' returning 1`)); const dn=dl.ok?dl.r.rows.length:0
  if(n||un||dn){iso=false;det.push(tb)}
}
t('ISO-01','usuário B não lê, altera nem apaga dados do usuário A em 11 tabelas'+(det.length?' ('+det+')':''),iso)
for (const tb of ['billing_events','billing_pending','billing_dead_letters','tx_quota_ledger']) {
  const r=await tryq(B,`select * from ${tb}`); t('ISO-02 '+tb,'tabela de cobrança inacessível ao usuário logado',!r.ok)
}
t('ISO-03','B não chama as funções de cobrança (kiwify_apply_grant)',!(await tryq(B,`select kiwify_apply_grant('x','e','a@t.test','premium',null,null)`)).ok)
t('ISO-04','B não chama feature_allowed/tx_used_this_month de outro usuário',!(await tryq(B,`select tx_used_this_month('${A}')`)).ok)
t('ISO-05','B não lança em conta/categoria de A (ownership)',!(await tryq(B,`insert into transactions(user_id,account_id,type,amount_cents,description) values('${B}','${acc[A]}','expense',1,'x')`)).ok)
fs.writeFileSync('/tmp/pg/reg-results.json',JSON.stringify(res,null,1)); console.log('TOTAL',res.length,'aprov',res.filter(x=>x.ok).length)
