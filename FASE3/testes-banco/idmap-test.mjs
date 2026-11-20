import { resolvePlanDetailed, idConfig, processEvent } from './api/kiwify-webhook.js'
let p=0,f=0; const t=(id,d,ok)=>{ok?p++:f++;console.log((ok?'OK   ':'FALHA ')+id+' '+d)}
// IDs FICTÍCIOS só para teste
const E={KIWIFY_PRODUCT_START:'T-START',KIWIFY_PRODUCT_PLUS:'T-PLUS',KIWIFY_PRODUCT_PRO:'T-PRO',KIWIFY_PRODUCT_PREMIUM:'T-PREM'}
const body=(id,name='x',planId)=>({Product:{product_id:id,product_name:name},Subscription:planId?{plan:{id:planId,name}}:undefined})
for (const [plan,envn] of [['start','KIWIFY_PRODUCT_START'],['plus','KIWIFY_PRODUCT_PLUS'],['pro_plan','KIWIFY_PRODUCT_PRO'],['premium','KIWIFY_PRODUCT_PREMIUM']])
  t('ID-0'+plan,`ID do produto ${E[envn]} => ${plan}`, resolvePlanDetailed(body(E[envn]),E).plan===plan && resolvePlanDetailed(body(E[envn]),E).via==='id')
t('ID-plano-assinatura','ID da oferta/plano da assinatura também é reconhecido', resolvePlanDetailed(body('qualquer','x','T-PRO'),E).plan==='pro_plan')
t('ID-estrito-nome','4 IDs configurados + ID desconhecido + nome "Premium" NÃO libera por nome', resolvePlanDetailed(body('OUTRO','Money Premium'),E).plan===null)
t('ID-estrito-via','motivo registrado como id-desconhecido', resolvePlanDetailed(body('OUTRO','Money Premium'),E).via==='id-desconhecido')
t('ID-troca','nome diz Premium mas ID é o do Start => Start (o ID manda)', resolvePlanDetailed(body('T-START','Money Premium'),E).plan==='start')
t('ID-duplicado','dois planos com o mesmo ID => recusa tudo', resolvePlanDetailed(body('T-PLUS'),{...E,KIWIFY_PRODUCT_PRO:'T-PLUS'}).plan===null && idConfig({...E,KIWIFY_PRODUCT_PRO:'T-PLUS'}).duplicated.length===2)
t('ID-parcial','só 2 IDs configurados: ID conhecido resolve', resolvePlanDetailed(body('T-PLUS'),{KIWIFY_PRODUCT_PLUS:'T-PLUS',KIWIFY_PRODUCT_START:'T-START'}).via==='id')
t('ID-transitorio','sem IDs (hoje em produção): cai no nome e registra via=name', (()=>{const r=resolvePlanDetailed(body('zzz','Money Plus'),{});return r.plan==='plus'&&r.via==='name'})())
t('ID-config-status','idConfig informa os que faltam sem mostrar valores', JSON.stringify(idConfig({KIWIFY_PRODUCT_START:'a'}).missing)==='["KIWIFY_PRODUCT_PLUS","KIWIFY_PRODUCT_PRO","KIWIFY_PRODUCT_PREMIUM"]')
t('ID-espacos','espaços em volta do ID configurado são ignorados', resolvePlanDetailed(body('T-PLUS'),{...E,KIWIFY_PRODUCT_PLUS:' T-PLUS '}).plan==='plus')
// processEvent: ID desconhecido em modo estrito => 500 + dead letter, nada liberado
const calls=[]; const db={async rpc(n,a){calls.push([n,a]);return {data:null,error:null}}}
const r=await processEvent(db,{webhook_event_type:'order_approved',order_status:'paid',order_id:'O1',Customer:{email:'a@b.com'},Product:{product_id:'DESCONHECIDO',product_name:'Money Premium'}},E)
t('ID-evento','evento pago com ID desconhecido => HTTP 500 + dead letter, sem liberar', r.code===500 && calls.length===1 && calls[0][0]==='kiwify_dead_letter' && /id-desconhecido/.test(calls[0][1].p_reason))
console.log(`\nRESULTADO: ${p} ok, ${f} falha(s)`); process.exit(f?1:0)
