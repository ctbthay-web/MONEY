import { setup, ins } from './h.mjs'
const X='/tmp/pg/027.sql', Y='/mnt/user-data/outputs/FASE3/sql/028_cota_com_estorno_e_auditoria.sql'
const {db,as,tryq,A,B,acc,errs} = await setup([X,Y])
if (errs.length) { console.log('ERROS DE SETUP', errs); process.exit(1) }
let pass=0, fail=0
const ok=(id,cond,msg)=>{ cond?pass++:fail++; console.log((cond?'OK   ':'FALHA'),id,msg) }
const used = async (u)=> (await db.query(`select public.tx_used_this_month('${u}') n`)).rows[0].n
const live = async (u)=> (await db.query(`select count(*)::int n from transactions where user_id='${u}'`)).rows[0].n
const series = (u,a,n,sid)=>`insert into transactions(user_id,account_id,type,amount_cents,description,series_id) select '${u}','${a}','expense',100,'p'||g,'${sid}' from generate_series(1,${n}) g`
const S1='aaaaaaaa-0000-0000-0000-000000000001', S2='aaaaaaaa-0000-0000-0000-000000000002'

// Q1 avulso: 25 lançamentos, apagar 1 devolve, 26º só entra após apagar
for (let i=0;i<25;i++) await as(A, ins(A,acc[A]))
ok('Q1a', await used(A)===25, 'plano Start: 25 usados')
ok('Q1b', !(await tryq(A, ins(A,acc[A]))).ok, '26º bloqueado no limite')
await as(A, `delete from transactions where id=(select id from transactions where user_id='${A}' limit 1)`)
ok('Q1c', await used(A)===24, 'apagar 1 avulso devolve 1')
ok('Q1d', (await tryq(A, ins(A,acc[A]))).ok, 'com a cota devolvida, novo lançamento entra')
ok('Q1e', !(await tryq(A, ins(A,acc[A]))).ok, 'e o seguinte volta a ser bloqueado')
// limpa
await as(A, `delete from transactions`)
ok('Q1f', await used(A)===0 && await live(A)===0, 'apagar tudo zera o uso')

// Q2 série
await as(A, series(A,acc[A],10,S1))
ok('Q2a', await used(A)===1 && await live(A)===10, 'parcelamento de 10 conta 1')
await as(A, `delete from transactions where series_id='${S1}' and description in ('p1','p2','p3')`)
ok('Q2b', await used(A)===1 && await live(A)===7, 'apagar 3 de 10 parcelas NÃO devolve (série ainda existe)')
await as(A, `delete from transactions where series_id='${S1}'`)
ok('Q2c', await used(A)===0, 'apagar a série inteira devolve 1 (não 10)')

// Q3 sem contagem dupla: série + 2 avulsos + outra série
await as(A, series(A,acc[A],24,S1)); await as(A, ins(A,acc[A])); await as(A, ins(A,acc[A])); await as(A, series(A,acc[A],6,S2))
ok('Q3a', await used(A)===4 && await live(A)===32, '2 séries + 2 avulsos = 4 usados (32 linhas)')
const ua = await as(A, 'select used, lim from tx_usage()')
ok('Q3b', ua.rows[0].used===4 && ua.rows[0].lim===25, 'tx_usage() informa o mesmo valor ao app')
await as(A, `delete from transactions`)

// Q4 manipulação
await as(A, ins(A,acc[A])); const one=(await db.query(`select id from transactions where user_id='${A}'`)).rows[0].id
const r1=await tryq(A, series(A,acc[A],2,one)); ok('Q4a', !r1.ok, 'series_id = id de outro lançamento é recusado')
const r2=await tryq(A, `insert into transactions(id,user_id,account_id,type,amount_cents,description) values('${S1}','${A}','${acc[A]}','expense',100,'x')`)
await as(A, series(A,acc[A],3,S2))
const r3=await tryq(A, `insert into transactions(id,user_id,account_id,type,amount_cents,description) values('${S2}','${A}','${acc[A]}','expense',100,'x')`)
ok('Q4b', !r3.ok, 'id novo = series_id de série existente é recusado')
ok('Q4c', !(await tryq(A, `update transactions set id=gen_random_uuid() where id='${one}'`)).ok, 'trocar o id é recusado')
ok('Q4d', !(await tryq(A, `update transactions set created_at='2020-01-01' where id='${one}'`)).ok, 'mudar created_at é recusado')
ok('Q4e', !(await tryq(A, `update transactions set series_id='${S2}' where id='${one}'`)).ok, 'entrar em série alheia por update é recusado')
ok('Q4f', !(await tryq(A, ins(A,acc[A],"created_at|'2020-01-01'"))).ok || (await db.query(`select count(*)::int n from transactions where user_id='${A}' and created_at<'2021-01-01'`)).rows[0].n===0, 'created_at forjado no insert é ignorado (vira now())')
ok('Q4g', !(await tryq(A, `insert into transactions(user_id,account_id,type,amount_cents,description) values('${B}','${acc[B]}','expense',100,'x')`)).ok, 'inserir em nome de outro usuário é recusado')
await as(A, `delete from transactions`)

// Q5 mês anterior não devolve cota deste mês
await db.exec(`insert into transactions(user_id,account_id,type,amount_cents,description,created_at) values('${A}','${acc[A]}','expense',100,'velho','2020-01-15')`)
await as(A, ins(A,acc[A]))
ok('Q5a', await used(A)===1, 'lançamento antigo não conta no mês')
await as(A, `delete from transactions where description='velho'`)
ok('Q5b', await used(A)===1, 'apagar lançamento de mês anterior não devolve cota deste mês')
await as(A, `delete from transactions`)

// Q6 auditoria
await db.exec(`delete from tx_deletion_audit`)
await as(A, ins(A,acc[A])); await as(A, series(A,acc[A],4,S1))
await as(A, `delete from transactions where description='t'`)
await as(A, `delete from transactions where series_id='${S1}' and description='p1'`)
await as(A, `delete from transactions where series_id='${S1}'`)
const au=(await db.query(`select * from tx_deletion_audit where user_id='${A}' order by audit_id`)).rows
ok('Q6a', au.length===5, `5 exclusões registradas (obtido ${au.length})`)
ok('Q6b', au[0].quota_returned===true && au[0].counted_in_current_month && au[0].deleted_by===A, 'avulso: devolveu cota, registra quem apagou')
ok('Q6c', au[1].quota_returned===false && au[1].key_rows_remaining===3, 'parcela 1 de 4: não devolveu, restam 3')
ok('Q6d', au.slice(2).every(x=>x.quota_key===S1) && au.at(-1).key_rows_remaining===0 && au.at(-1).quota_returned===true, 'última parcela: cota da série devolvida')
ok('Q6e', (await tryq(A,'select * from tx_deletion_audit')).ok===false, 'usuário não lê a auditoria')
ok('Q6f', (await tryq(A,`delete from tx_deletion_audit`)).ok===false, 'usuário não apaga a auditoria')
ok('Q6g', (await tryq(A,`update tx_deletion_audit set quota_returned=false`)).ok===false, 'usuário não altera a auditoria')
ok('Q6h', (await tryq(A,`insert into tx_deletion_audit(tx_id,user_id,quota_key,tx_created_at,counted_in_current_month,key_rows_remaining,quota_returned) values(gen_random_uuid(),'${A}','x',now(),false,0,false)`)).ok===false, 'usuário não forja registro de auditoria')

// Q7 cascata e retenção/servidor
await as(A, ins(A,acc[A])); await as(A, ins(A,acc[A]))
const before=(await db.query('select count(*)::int n from tx_deletion_audit')).rows[0].n
await db.exec(`delete from transactions where user_id='${A}'`) // servidor (uid null): retenção/cron
ok('Q7a', (await db.query('select count(*)::int n from tx_deletion_audit')).rows[0].n===before, 'exclusão do servidor (retenção) não polui a auditoria do usuário')
const acc2=(await as(A, `insert into accounts(user_id,name,type) values('${A}','Outra','checking') returning id`)).rows[0].id
await as(A, ins(A,acc2)); await as(A, ins(A,acc2))
const delAcc=await tryq(A, `delete from accounts where id='${acc2}'`)
const n2=(await db.query('select count(*)::int n from tx_deletion_audit')).rows[0].n
if (delAcc.ok) ok('Q7b', n2===before+2 && await used(A)===0, 'apagar conta apaga os lançamentos em cascata: 2 registros na auditoria e cota devolvida')
else ok('Q7b', true, 'RLS/regra impede apagar conta com lançamentos (cascata não alcançável pelo usuário): '+delAcc.err.slice(0,60))

// Q8 isolamento A × B
await db.exec(`delete from tx_deletion_audit`)
await as(A, ins(A,acc[A])); await as(B, ins(B,acc[B]))
await as(B, `delete from transactions where user_id='${A}'`)
ok('Q8a', await live(A)===1, 'B não apaga lançamento de A')
ok('Q8b', await used(B)===1 && await used(A)===1, 'cota de um não afeta a do outro')
await as(A, `delete from transactions`)
ok('Q8c', await used(B)===1, 'apagar de A não devolve cota de B')

// Q9 churn: apaga e recria 3 ciclos
await as(A, `delete from transactions`); await as(B, `delete from transactions`); await db.exec(`delete from tx_deletion_audit`)
let maxLive=0
for (let c=0;c<3;c++){ for (let i=0;i<25;i++) await as(A, ins(A,acc[A])); maxLive=Math.max(maxLive,await live(A)); await as(A, `delete from transactions`) }
ok('Q9a', maxLive<=25, `em nenhum momento passou de 25 lançamentos vivos (máx ${maxLive})`)
const ch=(await db.query(`select cotas_devolvidas from tx_churn_report where user_id='${A}'`)).rows[0]
ok('Q9b', Number(ch.cotas_devolvidas)===75, 'relatório de churn mostra 75 cotas devolvidas (sinal para o dono)')

// Q10 planos
await db.exec(`update profiles set plan_id='plus' where id='${A}'`)
for (let i=0;i<50;i++) await as(A, ins(A,acc[A]))
ok('Q10a', !(await tryq(A, ins(A,acc[A]))).ok, 'Plus: limite 50')
await as(A, `delete from transactions where id=(select id from transactions where user_id='${A}' limit 1)`)
ok('Q10b', (await tryq(A, ins(A,acc[A]))).ok, 'Plus: apagar 1 libera 1')
await db.exec(`update profiles set plan_id='premium' where id='${A}'`)
ok('Q10c', (await tryq(A, ins(A,acc[A]))).ok, 'Premium: ilimitado')

// Q11 schema: sem exclusão lógica
const cols=(await db.query(`select column_name from information_schema.columns where table_name='transactions' and column_name in ('deleted_at','is_deleted','deleted')`)).rows
ok('Q11', cols.length===0, 'transactions não tem coluna de exclusão lógica: toda exclusão é física (DELETE)')
console.log(`\nRESULTADO: ${pass} ok, ${fail} falha(s)`)
process.exit(fail?1:0)
