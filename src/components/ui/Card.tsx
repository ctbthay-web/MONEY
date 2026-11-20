import { type HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Reserva o brilho para o bloco mais importante da tela — usar com moderação. */
  glow?: boolean
}

export function Card({ className, glow, children, ...props }: CardProps) {
  return (
    <div className={cn('glass rounded-3xl shadow-card', glow && 'glow-ring', className)} {...props}>
      {children}
    </div>
  )
}
