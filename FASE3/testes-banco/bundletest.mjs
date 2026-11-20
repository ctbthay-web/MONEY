import { PGlite } from '@electric-sql/pglite'; import fs from 'fs'
const db=new PGlite(); await db.exec(fs.readFileSync('/tmp/pg/prelude.sql','utf8'))
let sql=fs.readFileSync('/mnt/user-data/outputs/FASE3/homologacao/00_MIGRACOES_COMPLETAS.sql','utf8').replace(/create extension[^;]*;/gi,'-- ext')
try{ await db.exec(sql); console.log('BUNDLE OK: carregou 001–028 em um único script')}catch(e){console.log('ERRO',e.message);process.exit(1)}
const t=(await db.query(`select count(*)::int n from information_schema.tables where table_schema='public'`)).rows[0].n
const tr=(await db.query(`select count(*)::int n from pg_trigger where not tgisinternal and tgrelid='public.transactions'::regclass`)).rows[0].n
console.log('tabelas public:',t,'| gatilhos em transactions:',tr)
// idempotência: rodar de novo não pode quebrar
try{ await db.exec(sql); console.log('RE-EXECUÇÃO OK (idempotente)')}catch(e){console.log('RE-EXECUÇÃO FALHOU:',e.message.slice(0,200))}
