import { setup, ins } from './h.mjs'
const {db,as,tryq,A,B,acc} = await setup()
// baseline: o limite funciona no caminho normal?
let n=0, fail
for (let i=0;i<40;i++){ const r=await tryq(A, ins(A,acc[A])); if(r.ok) n++; else {fail=r.err; break} }
console.log('T1 normal: aceitos', n, fail?('bloqueou: '+fail.slice(0,60)):'NÃO bloqueou')
// ataque 2: created_at forjado
n=0; fail=null
for (let i=0;i<40;i++){ const r=await tryq(A, ins(A,acc[A],"created_at|'2020-01-01'")); if(r.ok) n++; else {fail=r.err;break} }
console.log('T2 created_at forjado: aceitos', n, fail?'bloqueou':'NÃO bloqueou')
// ataque 3: mesmo series_id
const sid='11111111-1111-1111-1111-111111111111'
n=0; fail=null
for (let i=0;i<40;i++){ const r=await tryq(A, ins(A,acc[A],`series_id|'${sid}'`)); if(r.ok) n++; else {fail=r.err;break} }
console.log('T3 series_id repetido: aceitos', n, fail?'bloqueou':'NÃO bloqueou')
// ataque 4: update created_at de linhas existentes / series_id
const u=await tryq(A, `update transactions set created_at='2019-01-01'`)
console.log('T4 update created_at', u.ok?'permitido':'bloqueado')
