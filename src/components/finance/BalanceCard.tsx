import { moneyTone } from '../../lib/moneyTone'
import { Eye, EyeOff, TrendingDown, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { Card } from '../ui/Card'
import { formatCentsToBRL } from '../../lib/format'

interface BalanceCardProps {
  /** Saldo total: só o que já foi realizado (recebido/pago), sem cartão. */
  balanceCents: number
  /** Receitas e despesas do mês atual (pelo vencimento), quitadas ou não. */
  incomeCents: number
  expenseCents: number
}

export function BalanceCard({ balanceCents, incomeCents, expenseCents }: BalanceCardProps) {
  const [hidden, setHidden] = useState(false)

  return (
    <Card glow className="relative overflow-hidden p-6 sm:p-8">
      <div
        className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-brand-300/25 blur-[90px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-20 bottom-0 h-48 w-48 rounded-full bg-violet-400/15 blur-[80px]"
        aria-hidden
      />

      <div className="relative flex items-center justify-between">
        <span className="text-sm font-medium text-ink-secondary">Saldo total</span>
        <button
          onClick={() => setHidden((h) => !h)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-white/5 hover:text-ink-primary"
          aria-label={hidden ? 'Mostrar saldo' : 'Ocultar saldo'}
        >
          {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      <p className={`font-display relative mt-2 whitespace-nowrap text-[clamp(1.75rem,9vw,3rem)] font-bold leading-tight tracking-normal ${moneyTone(balanceCents)}`}>
        {hidden ? '•••••••' : formatCentsToBRL(balanceCents)}
      </p>

      <div className="relative mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-positive">
            <TrendingUp className="h-3.5 w-3.5" />
            Receitas do mês
          </div>
          <p className="mt-1.5 whitespace-nowrap text-base font-bold text-positive sm:text-lg">{hidden ? '•••••' : formatCentsToBRL(incomeCents)}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-danger">
            <TrendingDown className="h-3.5 w-3.5" />
            Despesas do mês
          </div>
          <p className="mt-1.5 whitespace-nowrap text-base font-bold text-danger sm:text-lg">{hidden ? '•••••' : formatCentsToBRL(expenseCents)}</p>
        </div>
      </div>
    </Card>
  )
}
