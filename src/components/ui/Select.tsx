import { forwardRef, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, children, ...props }, ref) => {
    const selectId = id ?? props.name
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-ink-secondary">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'h-12 w-full appearance-none rounded-2xl border border-border bg-surface px-4 pr-10 text-ink-primary',
              'transition-colors focus:outline-none focus:border-brand-400/60 focus:ring-2 focus:ring-brand-400/20',
              error && 'border-danger/60 focus:border-danger focus:ring-danger/20',
              className
            )}
            aria-invalid={Boolean(error)}
            {...props}
          >
            {children}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        </div>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    )
  }
)
Select.displayName = 'Select'
