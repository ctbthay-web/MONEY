import fs from 'fs'
import { setup } from './h.mjs'
const {db,as,tryq,A,B}=await setup(['/tmp/pg/027.sql','/mnt/user-data/outputs/FASE3/sql/028_cota_com_estorno_e_auditoria.sql','/mnt/user-data/outputs/FASE3/homologacao/90_seed_dados_ficticios.sql'])
let p=0,f=0; const ok=(i,c,m)=>{c?p++:f++;console.log((c?'OK   ':'FALHA ')+i+' '+m)}
await db.exec(`delete from accounts; update auth.users set email='usuario.a@money-homolog.test' where id='${A}'; update auth.users set email='usuario.b@money-homolog.test' where id='${B}'`)
const ra=(await db.query(`select public.seed_homologacao('usuario.a@money-homolog.test','A') r`)).rows[0].r
const rb=(await db.query(`select public.seed_homologacao('usuario.b@money-homolog.test','B') r`)).rows[0].r
ok('SEED-01',/semeado/.test(ra)&&/semeado/.test(rb),'A e B semeados')
ok('SEED-02',(await db.query(`select public.seed_homologacao('usuario.a@money-homolog.test','A') r`)).rows[0].r==='já semeado','idempotente (rodar 2x não duplica)')
ok('SEED-03',(await tryq(A,`select public.seed_homologacao('x@real.com','A')`)).ok===false,'usuário logado não chama o seed')
let e1; try{await db.query(`select public.seed_homologacao('pessoa@gmail.com','A')`)}catch(e){e1=e.message}
ok('SEED-04',/RECUSADO/.test(e1||''),'e-mail que não termina em .test é recusado (proteção contra produção)')
const cnt=async(u,t)=>(await as(u,`select count(*)::int n from ${t}`)).rows[0].n
ok('SEED-05',await cnt(A,'transactions')===10 && await cnt(B,'transactions')===10,'10 lançamentos por usuário')
const leak=await as(B,`select count(*)::int n from transactions where description like '%HOMOLOG A%'`)
ok('SEED-06',leak.rows[0].n===0,'B não enxerga nenhum dado marcado [HOMOLOG A]')
const leak2=await as(A,`select (select count(*) from accounts where name like '%HOMOLOG B%') + (select count(*) from goals where name like '%HOMOLOG B%') + (select count(*) from loans where counterparty like '%HOMOLOG B%') n`)
ok('SEED-07',Number(leak2.rows[0].n)===0,'A não enxerga contas/metas/empréstimos de B')
const u=(await as(A,'select used from tx_usage()')).rows[0].used
ok('SEED-08',u===5,`cota usada pelo seed: ${u} (3 avulsos + 1 série + 1 cartão = 5)`)
console.log(`\nRESULTADO: ${p} ok, ${f} falha(s)`); process.exit(f?1:0)
