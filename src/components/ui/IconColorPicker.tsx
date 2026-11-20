import { ICON_OPTIONS, COLOR_OPTIONS, resolveIcon } from '../../lib/icons'
import { cn } from '../../lib/cn'

export function IconPicker({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink-secondary">Ícone</span>
      <div className="grid grid-cols-7 gap-2">
        {ICON_OPTIONS.map((name) => {
          const Icon = resolveIcon(name)
          const active = value === name
          return (
            <button
              key={name}
              type="button"
              onClick={() => onChange(name)}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors',
                active
                  ? 'border-brand-400/60 bg-brand-500/15 text-brand-300'
                  : 'border-border text-ink-secondary hover:bg-white/5'
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink-secondary">Cor</span>
      <div className="flex flex-wrap gap-2">
        {COLOR_OPTIONS.map((color) => {
          const active = value === color
          return (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              className={cn(
                'h-8 w-8 rounded-full border-2 transition-transform',
                active ? 'scale-110 border-white' : 'border-transparent hover:scale-105'
              )}
              style={{ backgroundColor: color }}
              aria-label={color}
            />
          )
        })}
      </div>
    </div>
  )
}
