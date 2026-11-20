import { cn } from '../../lib/cn'

/** Botão deslizante (toggle) acessível. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50',
        checked ? 'border-transparent bg-brand-gradient' : 'border-border bg-surface-lighter'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full shadow transition-all',
          checked ? 'left-[1.625rem] bg-[#04241C]' : 'left-0.5 bg-ink-muted'
        )}
      />
    </button>
  )
}
