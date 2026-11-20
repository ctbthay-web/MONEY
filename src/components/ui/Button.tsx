import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-brand-gradient text-[#04241C] font-semibold shadow-glow hover:brightness-110 active:brightness-95 disabled:opacity-50',
  secondary:
    'glass text-ink-primary hover:border-border-strong hover:bg-white/[0.08] disabled:opacity-50',
  ghost: 'bg-transparent text-ink-secondary hover:text-ink-primary hover:bg-white/5 disabled:opacity-50',
  danger: 'bg-danger/90 text-[rgb(var(--danger-on))] font-semibold hover:bg-danger disabled:opacity-50',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-9 px-4 text-sm gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-12 px-7 text-base gap-2',
  icon: 'h-11 w-11 p-0',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center rounded-full transition-all duration-150 select-none whitespace-nowrap',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
