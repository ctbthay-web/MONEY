// Dados de identificação e contato usados nas páginas de Termos, Privacidade e no suporte.
// Vêm de variáveis de ambiente do build (VITE_*), para não ficarem fixos no código. Se um dado não estiver
// configurado, a página não inventa nada: simplesmente omite aquela linha.
const env = import.meta.env

export const LEGAL = {
  brand: 'Money',
  /** nome ou razão social de quem opera o serviço (controlador dos dados) */
  company: (env.VITE_LEGAL_NAME ?? '').trim(),
  /** CPF ou CNPJ de quem opera o serviço */
  document: (env.VITE_LEGAL_DOC ?? '').trim(),
  supportEmail: (env.VITE_SUPPORT_EMAIL ?? '').trim(),
  /** só dígitos com DDI e DDD, ex.: 5548999999999 */
  supportWhatsapp: (env.VITE_SUPPORT_WHATSAPP ?? '').replace(/\D/g, ''),
  /** muda quando os Termos/Política mudam de forma relevante; é gravada no cadastro de quem aceita */
  termsVersion: '2026-11-15',
  updatedAt: '15 de novembro de 2026',
}

export const hasSupport = Boolean(LEGAL.supportEmail || LEGAL.supportWhatsapp)

export function supportMailto(subject = 'Suporte Money'): string {
  return LEGAL.supportEmail ? `mailto:${LEGAL.supportEmail}?subject=${encodeURIComponent(subject)}` : ''
}

export function supportWhatsappUrl(text = 'Olá! Preciso de ajuda com o Money.'): string {
  return LEGAL.supportWhatsapp ? `https://wa.me/${LEGAL.supportWhatsapp}?text=${encodeURIComponent(text)}` : ''
}
