import { setup, ins } from './h.mjs'
const {db,as,tryq,B,acc} = await setup(['/mnt/user-data/outputs/FASE2/sql/027_fase2_seguranca_cobranca.sql','/mnt/user-data/outputs/FASE2/sql/027b_OPCIONAL_cota_sem_estorno.sql'])
let total=0
for (let r=0;r<3;r++){ for(let i=0;i<25;i++){ if((await tryq(B,ins(B,acc[B]))).ok) total++ } await as(B,'delete from transactions') }
console.log('027b delete+reinsert: criados', total, total===25?'OK (bloqueado)':'FALHA')
