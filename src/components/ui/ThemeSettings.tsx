import { useEffect, useState } from 'react'
import { Moon, Sun, Check, Pipette } from 'lucide-react'
import {
  ACCENTS,
  BACKGROUNDS,
  DEFAULT_THEME,
  loadTheme,
  pushThemeToAccount,
  saveTheme,
  type ThemeMode,
  type ThemeState,
} from '../../lib/theme'
import { cn } from '../../lib/cn'

/** Rodinha de cor: escolhe qualquer cor (abre o seletor do navegador). */
function CustomSwatch({
  value,
  selected,
  label,
  onChange,
}: {
  value: string
  selected: boolean
  label: string
  onChange: (hex: string) => void
}) {
  return (
    <label
      title={label}
      className={cn(
        'relative flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border',
        selected && 'ring-2 ring-brand-400 ring-offset-2 ring-offset-[var(--c-bg)]'
      )}
      style={{
        background: selected
          ? value
          : 'conic-gradient(#ef4444, #eab308, #22c55e, #06b6d4, #6366f1, #ec4899, #ef4444)',
      }}
    >
      <Pipette className="h-3.5 w-3.5 text-white mix-blend-difference" strokeWidth={2.5} />
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  )
}

function Swatch({
  color,
  label,
  selected,
  onClick,
  empty,
}: {
  color: string
  label: string
  selected: boolean
  onClick: () => void
  empty?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={selected}
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border transition-transform',
        selected && 'scale-110 ring-2 ring-brand-400 ring-offset-2 ring-offset-[var(--c-bg)]'
      )}
      style={{ backgroundColor: color }}
    >
      {selected && <Check className="h-3.5 w-3.5 text-white mix-blend-difference" strokeWidth={3} />}
      {empty && !selected && <span className="h-0.5 w-3.5 rotate-45 rounded bg-ink-muted" />}
    </button>
  )
}

/** Modo (noturno/claro), cor dos botões/destaques e cor do fundo — compacto, vale para este aparelho. */
export function ThemeSettings() {
  const [theme, setTheme] = useState<ThemeState>(() => loadTheme())

  // se a conta trouxer a escolha feita em outro aparelho, a tela acompanha
  useEffect(() => {
    const onChange = (e: Event) => setTheme((e as CustomEvent<ThemeState>).detail)
    window.addEventListener('money-theme-change', onChange)
    return () => window.removeEventListener('money-theme-change', onChange)
  }, [])

  function update(next: Partial<ThemeState>) {
    const merged = { ...theme, ...next }
    setTheme(merged)
    saveTheme(merged)
    pushThemeToAccount(merged)
  }

  const modes: { id: ThemeMode; label: string; icon: typeof Moon }[] = [
    { id: 'dark', label: 'Noturno', icon: Moon },
    { id: 'light', label: 'Claro', icon: Sun },
  ]

  const bgKey = theme.mode === 'dark' ? 'bgDark' : 'bgLight'
  const bgValue = theme[bgKey]
  const bgOptions = BACKGROUNDS[theme.mode]
  const bgIsPreset = bgOptions.some((o) => o.hex?.toLowerCase() === bgValue?.toLowerCase())
  const bgCustomSelected = Boolean(bgValue) && !bgIsPreset
  const defaultSwatch = theme.mode === 'dark' ? '#030B09' : '#F3F7F6'
  const isDefault =
    theme.accent === DEFAULT_THEME.accent && !theme.bgDark && !theme.bgLight

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/5 p-1">
        {modes.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => update({ mode: id })}
            aria-pressed={theme.mode === id}
            className={cn(
              'flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
              theme.mode === id ? 'bg-brand-gradient text-[#04241C]' : 'text-ink-secondary hover:text-ink-primary'
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={2.25} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-ink-secondary">Cor dos botões e destaques</p>
        <div className="flex flex-wrap items-center gap-2.5">
          {ACCENTS.map((a) => (
            <Swatch
              key={a.id}
              color={a.swatch}
              label={a.label}
              selected={theme.accent === a.id}
              onClick={() => update({ accent: a.id })}
            />
          ))}
          <CustomSwatch
            value={theme.customAccent}
            selected={theme.accent === 'custom'}
            label="Outra cor"
            onChange={(hex) => update({ accent: 'custom', customAccent: hex })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-ink-secondary">Cor do fundo ({theme.mode === 'dark' ? 'noturno' : 'claro'})</p>
        <div className="flex flex-wrap items-center gap-2.5">
          {bgOptions.map((o) => (
            <Swatch
              key={o.label}
              color={o.hex ?? defaultSwatch}
              label={o.label}
              selected={o.hex ? bgValue?.toLowerCase() === o.hex.toLowerCase() : !bgValue}
              onClick={() => update({ [bgKey]: o.hex })}
              empty={!o.hex}
            />
          ))}
          <CustomSwatch
            value={bgValue ?? defaultSwatch}
            selected={bgCustomSelected}
            label="Outra cor de fundo"
            onChange={(hex) => update({ [bgKey]: hex })}
          />
        </div>
      </div>

      {!isDefault && (
        <button
          type="button"
          onClick={() => update({ accent: 'green', bgDark: null, bgLight: null })}
          className="self-start text-xs font-semibold text-brand-300 hover:underline"
        >
          Restaurar cores padrão
        </button>
      )}
    </div>
  )
}
