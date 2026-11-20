import { Mail, MessageCircle } from 'lucide-react'
import { LEGAL, hasSupport, supportMailto, supportWhatsappUrl } from '../../lib/legal'

/** Canais de suporte configurados (e-mail e/ou WhatsApp). Não renderiza nada se nenhum estiver configurado. */
export function SupportLinks({ className = '' }: { className?: string }) {
  if (!hasSupport) return null
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-4 gap-y-1 ${className}`}>
      {LEGAL.supportEmail && (
        <a href={supportMailto()} className="inline-flex items-center gap-1.5 font-medium text-brand-300 hover:text-brand-200">
          <Mail className="h-4 w-4" /> {LEGAL.supportEmail}
        </a>
      )}
      {LEGAL.supportWhatsapp && (
        <a
          href={supportWhatsappUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-medium text-brand-300 hover:text-brand-200"
        >
          <MessageCircle className="h-4 w-4" /> WhatsApp
        </a>
      )}
    </span>
  )
}
