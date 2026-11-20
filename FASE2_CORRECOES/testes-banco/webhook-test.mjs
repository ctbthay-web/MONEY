import { createHmac } from 'node:crypto'
import { build } from './load.mjs'
import { verifySignature, processEvent, default as handler } from './api/kiwify-webhook.js'
const F='/mnt/user-data/outputs/FASE2/sql/027_fase2_seguranca_cobranca.sql'
const TOKEN='tok_teste_homologacao'
const results=[]; const t=(id,desc,ok,extra='')=>{results.push({id,desc,ok,extra}); console.log((ok?'OK   ':'FALHA ')+id+' '+desc+(extra?' ['+extra+']':''))}
const {db,errs}=await build(26,[F]); if(errs.length){console.log(errs);process.exit(1)}
const U='00000000-0000-0000-0000-0000000000aa'
await db.exec(`insert into auth.users(id,email) values('${U}','cliente@teste.test')`)
const SIG=(b)=>createHmac('sha1',TOKEN).update(b).digest('hex')
const fake={ async rpc(name,a){ try{
  const map={kiwify_apply_grant:['p_payment_id','p_event','p_email','p_plan','p_informed','p_sub'],kiwify_apply_status:['p_kind','p_email','p_sub'],kiwify_dead_letter:['p_reason','p_payload']}
  const cols=map[name]; const vals=cols.map(c=>c==='p_payload'?JSON.stringify(a[c]):a[c]??null)
  const casts={p_informed:'::timestamptz',p_payload:'::jsonb'}
  const r=await db.query(`select public.${name}(${cols.map((c,i)=>'$'+(i+1)+(casts[c]||'')).join(',')}) as v`,vals); return {data:r.rows[0].v,error:null}
 }catch(e){return {data:null,error:{message:e.message}}}}}
const ev=(o={})=>({webhook_event_type:'order_approved',order_status:'paid',order_id:'ORD1',Customer:{email:'cliente@teste.test'},Product:{product_id:'p1',product_name:'Money Plus'},Subscription:{id:'SUB1',plan:{name:'PLUS'}},...o})
const prof=async()=> (await db.query(`select plan_id,paid_until,billing_status,billing_subscription_id from profiles where id='${U}'`)).rows[0]
const events=async()=> (await db.query(`select count(*)::int n from billing_events`)).rows[0].n
const env={}

// ---- assinatura ----
const bodyObj=ev(); const raw=Buffer.from(JSON.stringify(bodyObj,null,2)) // corpo com espaços/formatação: re-serializar mudaria os bytes
t('SIG-01','assinatura sobre corpo bruto (formatado) é aceita',verifySignature({raw,parsed:null},SIG(raw),TOKEN)==='raw')
const compact=Buffer.from(JSON.stringify(bodyObj))
t('SIG-02','assinatura calculada sobre JSON compacto, corpo enviado formatado, é aceita pelo caminho re-serializado',verifySignature({raw,parsed:null},SIG(compact),TOKEN)==='reserialized')
t('SIG-03','assinatura errada é recusada',verifySignature({raw,parsed:null},'0'.repeat(40),TOKEN)===null)
const tampered=Buffer.from(raw.toString().replace('ORD1','ORD2'))
t('SIG-04','corpo adulterado (order_id trocado) com assinatura do original é recusado',verifySignature({raw:tampered,parsed:null},SIG(raw),TOKEN)===null)
t('SIG-05','sem assinatura / sem token é recusado',verifySignature({raw,parsed:null},'',TOKEN)===null && verifySignature({raw,parsed:null},SIG(raw),'')===null)
t('SIG-06','assinatura com tamanho diferente não lança exceção',verifySignature({raw,parsed:null},'abc',TOKEN)===null)
t('SIG-07','assinatura em maiúsculas (hex) é aceita',verifySignature({raw,parsed:null},SIG(raw).toUpperCase(),TOKEN)==='raw')

// ---- handler HTTP (mock req/res; sem banco) ----
process.env.KIWIFY_WEBHOOK_TOKEN=TOKEN; process.env.SUPABASE_SERVICE_ROLE_KEY='x'
const call=async(method,body,sig)=>{ let out; const res={status(c){out={code:c};return this},json(j){out.json=j;return this}}
  const req={method,query:{signature:sig},body:body===undefined?undefined:Buffer.from(body),[Symbol.asyncIterator]:async function*(){}}; await handler(req,res); return out}
t('HTTP-01','GET retorna 405',(await call('GET'))?.code===405)
t('HTTP-02','POST sem assinatura retorna 401 (order_id + e-mail não bastam)',(await call('POST',JSON.stringify(ev()),''))?.code===401)
t('HTTP-03','POST com assinatura errada retorna 401',(await call('POST',JSON.stringify(ev()),'f'.repeat(40)))?.code===401)
const junk='{nao json'; t('HTTP-04','corpo inválido mas assinado retorna 400',(await call('POST',junk,SIG(Buffer.from(junk))))?.code===400)

// ---- regras de cobrança (banco real, via processEvent) ----
let r=await processEvent(fake,ev(),env)
const p1=await prof()
t('PAG-01','compra aprovada libera plano e acesso',r.code===200&&r.json.result==='applied'&&p1.plan_id==='plus'&&new Date(p1.paid_until)>new Date(),JSON.stringify(r.json))
r=await processEvent(fake,ev(),env); const p2=await prof()
t('PAG-02','evento duplicado não soma outro mês',r.json.result==='duplicate'&&+new Date(p2.paid_until)===+new Date(p1.paid_until))
r=await processEvent(fake,ev({webhook_event_type:'subscription_renewed',order_id:'ORD1R'}),env); const p3=await prof()
t('PAG-03','renovação (outro evento do mesmo pedido) estende ~1 mês',r.json.result==='applied'&&(new Date(p3.paid_until)-new Date(p2.paid_until))>27*864e5)
r=await processEvent(fake,ev({order_id:'ORD9',order_status:'refused'}),env); const p4=await prof()
t('PAG-04','pagamento recusado (order_approved + refused) não libera',r.code===200&&r.json.ignored&&+new Date(p4.paid_until)===+new Date(p3.paid_until))
r=await processEvent(fake,ev({webhook_event_type:'order_rejected',order_status:'refused',order_id:'ORD8'}),env)
t('PAG-05','evento order_rejected é ignorado',r.json.ignored===true)
r=await processEvent(fake,ev({webhook_event_type:'subscription_late',order_id:'L1'}),env)
t('PAG-06','atraso marca past_due',(await prof()).billing_status==='past_due')
r=await processEvent(fake,ev({webhook_event_type:'subscription_canceled',order_id:'C1'}),env); const p5=await prof()
t('PAG-07','cancelamento marca canceled e mantém o que já foi pago',p5.billing_status==='canceled'&&+new Date(p5.paid_until)===+new Date(p3.paid_until))
r=await processEvent(fake,ev({webhook_event_type:'order_refunded',order_status:'refunded',order_id:'R1',Subscription:{id:'SUB-ANTIGA'}}),env)
t('PAG-08','reembolso de assinatura ANTIGA não derruba o plano atual',r.json.result==='old_subscription'&&new Date((await prof()).paid_until)>new Date())
r=await processEvent(fake,ev({webhook_event_type:'order_refunded',order_status:'refunded',order_id:'R2'}),env); const p6=await prof()
t('PAG-09','reembolso revoga o acesso',p6.billing_status==='refunded'&&new Date(p6.paid_until)<=new Date())
r=await processEvent(fake,ev({Customer:{email:'invalido'}}),env)
t('PAG-10','e-mail inválido é ignorado',r.json.ignored===true)
r=await processEvent(fake,ev({order_id:'OX',Product:{product_id:'zzz',product_name:'Outro'},Subscription:{plan:{name:'?'}}}),env)
const dl=(await db.query('select count(*)::int n from billing_dead_letters')).rows[0].n
t('PAG-11','plano não identificado → 500 (Kiwify reenvia) + fila de reprocessamento',r.code===500&&dl===1)
r=await processEvent(fake,ev({order_id:'OX',Product:{product_id:'pX'}}),{KIWIFY_PRODUCT_PREMIUM:'pX'})
t('PAG-12','após mapear o produto, o REENVIO libera o acesso',r.json.result==='applied'&&(await prof()).plan_id==='premium')

// ---- falha durante a liberação (Falha 3) ----
await db.exec(`update profiles set paid_until=null, plan_id='free', billing_status=null where id='${U}'`)
await db.exec(`create function pg_temp.boom() returns trigger language plpgsql as $$ begin raise exception 'falha simulada'; end $$;`).catch(()=>{})
await db.exec(`create or replace function public.test_boom() returns trigger language plpgsql as $$ begin raise exception 'falha simulada ao gravar perfil'; end $$;
create trigger z_boom before update on public.profiles for each row execute function public.test_boom();`)
const before=await events()
r=await processEvent(fake,ev({order_id:'FALHA1'}),env)
t('FAL-01','falha ao gravar o perfil → 500 e evento NÃO fica marcado como concluído',r.code===500&&(await events())===before)
await db.exec('drop trigger z_boom on public.profiles')
r=await processEvent(fake,ev({order_id:'FALHA1'}),env)
t('FAL-02','reenvio da Kiwify após a falha libera o acesso (cliente não fica sem acesso)',r.json.result==='applied'&&(await prof()).plan_id==='plus'&&new Date((await prof()).paid_until)>new Date())

// ---- compra antes do cadastro ----
r=await processEvent(fake,ev({order_id:'PEND1',Customer:{email:'novo@teste.test'},Subscription:{id:'SUBN',plan:{name:'PRO'}},Product:{product_name:'Money Pro'}}),env)
t('PEN-01','compra com e-mail ainda sem conta fica pendente',r.json.result==='pending')
const N='00000000-0000-0000-0000-0000000000bb'; await db.exec(`insert into auth.users(id,email) values('${N}','novo@teste.test')`)
const pn=(await db.query(`select plan_id,paid_until from profiles where id='${N}'`)).rows[0]
t('PEN-02','ao cadastrar o e-mail, o plano pago é aplicado',pn.plan_id==='pro_plan'&&new Date(pn.paid_until)>new Date())

const ok=results.filter(x=>x.ok).length; console.log(`\nTOTAL ${results.length} | aprovados ${ok} | reprovados ${results.length-ok}`)
import fs from 'fs'; fs.writeFileSync('/tmp/pg/webhook-results.json',JSON.stringify(results,null,1))

// ---- renovações com o mesmo order_id (M-01) ----
await db.exec(`update profiles set paid_until=null where id='${U}'`)
const ren=(d)=>ev({webhook_event_type:'subscription_renewed',order_id:'SAMEORD',approved_date:d})
let a=await processEvent(fake,ren('2026-11-01 10:00'),env); const q1=new Date((await prof()).paid_until)
let b=await processEvent(fake,ren('2026-12-01 10:00'),env); const q2=new Date((await prof()).paid_until)
let c=await processEvent(fake,ren('2026-12-01 10:00'),env); const q3=new Date((await prof()).paid_until)
t('REN-01','2ª renovação do MESMO pedido (outra cobrança) também é aplicada',a.json.result==='applied'&&b.json.result==='applied'&&q2>q1)
t('REN-02','reenvio da mesma cobrança continua sendo duplicado',c.json.result==='duplicate'&&+q3===+q2)
fs.writeFileSync('/tmp/pg/webhook-results.json',JSON.stringify(results,null,1)); console.log(`TOTAL FINAL ${results.length} aprovados ${results.filter(x=>x.ok).length}`)
