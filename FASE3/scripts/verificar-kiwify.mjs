// Confere a configuração da Kiwify SEM mostrar valores secretos.
// Uso:  node --env-file=.env.local scripts/verificar-kiwify.mjs [payload1.json payload2.json ...]
// Cada payload é o corpo de um aviso real da Kiwify (veja Kiwify > Apps > Webhooks > histórico, ou billing_dead_letters.payload).
// Mostra, para cada payload, QUAL plano do Money o webhook escolheria, e por qual caminho (id / name).
import fs from 'node:fs'
import { idConfig, resolvePlanDetailed } from '../api/kiwify-webhook.js'

const mask = (v) => (v ? `${'*'.repeat(Math.max(0, String(v).length - 4))}${String(v).slice(-4)}` : '(vazio)')
const NAMES = ['KIWIFY_PRODUCT_START', 'KIWIFY_PRODUCT_PLUS', 'KIWIFY_PRODUCT_PRO', 'KIWIFY_PRODUCT_PREMIUM']
const SECRETS = ['KIWIFY_WEBHOOK_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY']
const PUBLIC = ['VITE_KIWIFY_URL_START', 'VITE_KIWIFY_URL_PLUS', 'VITE_KIWIFY_URL_PRO', 'VITE_KIWIFY_URL_PREMIUM', 'VITE_SUPABASE_URL']

console.log('== IDs de produto (Kiwify) ==')
for (const n of NAMES) console.log(`${process.env[n] ? 'OK     ' : 'FALTA  '}${n} ${mask(process.env[n])}`)
const cfg = idConfig(process.env)
console.log(cfg.complete && !cfg.duplicated.length ? '\nModo ESTRITO ativo: só o ID decide o plano.' : cfg.duplicated.length ? `\nERRO: IDs repetidos entre ${cfg.duplicated.join(', ')}` : `\nModo TRANSITÓRIO (faltam ${cfg.missing.join(', ')}): o nome do plano ainda pode decidir. Preencha os 4 IDs para ativar o modo estrito.`)
console.log('\n== Segredos (só presença) ==')
for (const n of SECRETS) console.log(`${process.env[n] ? 'OK     ' : 'FALTA  '}${n}`)
console.log('\n== Links de checkout (públicos) ==')
for (const n of PUBLIC) console.log(`${process.env[n] ? 'OK     ' : 'FALTA  '}${n}`)

for (const file of process.argv.slice(2)) {
  const body = JSON.parse(fs.readFileSync(file, 'utf8'))
  const r = resolvePlanDetailed(body, process.env)
  console.log(`\n${file}\n  produto: ${body?.Product?.product_name ?? '?'} (id ${mask(body?.Product?.product_id)})  oferta/plano: ${body?.Subscription?.plan?.name ?? '?'}\n  => plano do Money: ${r.plan ?? 'NÃO IDENTIFICADO'} (caminho: ${r.via})`)
}
