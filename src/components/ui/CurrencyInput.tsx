import { forwardRef, useState, useEffect, type InputHTMLAttributes } from 'react'
import { centsToInputValue, parseBRLToCents } from '../../lib/format'
import { cn } from '../../lib/cn'

interface CurrencyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label?: string
  error?: string
  valueCents: number
  onValueChange: (cents: number) => void
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, label, error, valueCents, onValueChange, id, ...props }, ref) => {
    const [display, setDisplay] = useState(valueCents ? centsToInputValue(valueCents) : '')

    useEffect(() => {
      setDisplay(valueCents ? centsToInputValue(valueCents) : '')
    }, [valueCents])

    const inputId = id ?? props.name

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-ink-secondary">
            {label}
          </label>
        )}
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted">R$</span>
          <input
            ref={ref}
            id={inputId}
            inputMode="decimal"
            className={cn(
              'h-14 w-full rounded-2xl border border-border bg-surface pl-11 pr-4 text-xl font-semibold text-ink-primary placeholder:text-ink-muted',
              'transition-colors focus:outline-none focus:border-brand-400/60 focus:ring-2 focus:ring-brand-400/20',
              error && 'border-danger/60 focus:border-danger focus:ring-danger/20',
              className
            )}
            placeholder="0,00"
            value={display}
            onChange={(e) => {
              const cents = parseBRLToCents(e.target.value)
              setDisplay(cents ? centsToInputValue(cents) : '')
              onValueChange(cents)
            }}
            aria-invalid={Boolean(error)}
            {...props}
          />
        </div>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    )
  }
)
CurrencyInput.displayName = 'CurrencyInput'
