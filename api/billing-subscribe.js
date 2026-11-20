// POST /api/billing-subscribe — DESLIGADO.
// A cobrança nova é só pela Kiwify (ver api/kiwify-webhook.js). Este endpoint criava assinatura no Asaas
// (R$ 12,90, fora da tabela de preços atual) e foi desativado para não gerar cobranças fora dos planos.
// billing-cancel e billing-webhook continuam ativos para quem já assinava pelo Asaas.
export default function handler(req, res) {
  return res.status(410).json({ error: 'As assinaturas agora são feitas pela página de planos.' })
}
