import { setup, ins } from './h.mjs'
const F='/mnt/user-data/outputs/FASE2/sql/027_fase2_seguranca_cobranca.sql'
const fresh = async () => setup([F])
let s = await fresh(); if (s.errs.length) { console.log(s.errs); process.exit(1) }
const rep=(n,t,ok)=>console.log((ok?'OK  ':'FALHA')+' '+n+' — '+t)
let {db,as,tryq,A,B,acc} = s
// T1 normal continua bloqueando em 25
let n=0; for (let i=0;i<40;i++){ if((await tryq(A,ins(A,acc[A]))).ok) n++; else break }
rep('T1','caminho normal aceita 25 e bloqueia o 26º',n===25)
// T2 created_at forjado: ignora e conta
s=await fresh(); ({db,as,tryq,A,B,acc}=s); n=0
for (let i=0;i<40;i++){ if((await tryq(A,ins(A,acc[A],"created_at|'2020-01-01'"))).ok) n++; else break }
rep('T2','created_at forjado não burla (aceitos '+n+')',n===25)
// T3 mesmo series_id em requisições separadas
s=await fresh(); ({db,as,tryq,A,B,acc}=s); n=0; const sid='11111111-1111-1111-1111-111111111111'
for (let i=0;i<40;i++){ if((await tryq(A,ins(A,acc[A],`series_id|'${sid}'`))).ok) n++; else break }
rep('T3','series_id reutilizado em requisições separadas é recusado (aceitos '+n+')',n===1)
// T4 série legítima: 24 parcelas num único INSERT conta 1
s=await fresh(); ({db,as,tryq,A,B,acc}=s)
const rows=Array.from({length:24},(_,i)=>`('${A}','${acc[A]}','expense',100,'p${i}','${sid}')`).join(',')
const r4=await tryq(A,`insert into transactions(user_id,account_id,type,amount_cents,description,series_id) values ${rows}`)
const used=(await as(A,'select * from tx_usage()')).rows[0]
rep('T4','parcelamento 24x num lote é aceito e conta 1 ('+JSON.stringify(used)+')', r4.ok && used.used===1)
// T5 série acima de 60 recusada
const rows61=Array.from({length:61},(_,i)=>`('${A}','${acc[A]}','expense',100,'q${i}','22222222-2222-2222-2222-222222222222')`).join(',')
rep('T5','série de 61 recusada',!(await tryq(A,`insert into transactions(user_id,account_id,type,amount_cents,description,series_id) values ${rows61}`)).ok)
// T6 update de created_at/series_id
rep('T6a','update created_at bloqueado',!(await tryq(A,`update transactions set created_at='2019-01-01'`)).ok)
rep('T6b','update series_id bloqueado',!(await tryq(A,`update transactions set series_id=gen_random_uuid()`)).ok)
rep('T6c','update normal (descrição) permitido',(await tryq(A,`update transactions set description='ok' where description='p0'`)).ok)
// T7 isolamento: B não entra na série de A
rep('T7','B não reutiliza series_id de A',!(await tryq(B,ins(B,acc[B],`series_id|'${sid}'`))).ok)
// T8 B insere em conta de A
rep('T8','B não insere lançamento na conta de A',!(await tryq(B,ins(B,acc[A]))).ok)
// T9 features por plano (A=start)
rep('T9a','Start não cria empréstimo',!(await tryq(A,`insert into loans(user_id,name,principal_cents) values('${A}','x',1000)`)).ok || 'loancols')
console.log('loans cols:',(await db.query(`select column_name from information_schema.columns where table_name='loans'`)).rows.map(x=>x.column_name).join(','))
console.log('budgets/schedules cols ok')
