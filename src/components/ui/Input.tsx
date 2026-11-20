import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '../../lib/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  leftIcon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, leftIcon, id, type, ...props }, ref) => {
    const inputId = id ?? props.name
    const isPassword = type === 'password'
    const [visible, setVisible] = useState(false)

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-ink-secondary">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            type={isPassword ? (visible ? 'text' : 'password') : type}
            className={cn(
              'h-12 w-full rounded-2xl border border-border bg-surface px-4 text-ink-primary placeholder:text-ink-muted',
              'transition-colors focus:outline-none focus:border-brand-400/60 focus:ring-2 focus:ring-brand-400/20',
              leftIcon && 'pl-11',
              isPassword && 'pr-11',
              error && 'border-danger/60 focus:border-danger focus:ring-danger/20',
              className
            )}
            aria-invalid={Boolean(error)}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-white/5 hover:text-ink-primary"
              aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    )
  }
)
Input.displayName = 'Input'
