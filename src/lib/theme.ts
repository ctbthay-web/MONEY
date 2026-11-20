import { supabase } from './supabase'

// Tema do app: modo (noturno = verde escuro, claro = branco) + cor dos botões/destaques + cor do fundo.
// Guardado por aparelho em localStorage; aplicado no <html> (atributos + variáveis CSS, ver index.css).
export type ThemeMode = 'dark' | 'light'
export type Accent = 'green' | 'blue' | 'violet' | 'pink' | 'orange' | 'red' | 'yellow' | 'teal' | 'indigo' | 'slate'

export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: 'green', label: 'Verde-água', swatch: '#4FD1C5' },
  { id: 'teal', label: 'Esmeralda', swatch: '#10B981' },
  { id: 'blue', label: 'Azul', swatch: '#3B82F6' },
  { id: 'indigo', label: 'Índigo', swatch: '#6366F1' },
  { id: 'violet', label: 'Roxo', swatch: '#8B5CF6' },
  { id: 'pink', label: 'Rosa', swatch: '#EC4899' },
  { id: 'red', label: 'Vermelho', swatch: '#EF4444' },
  { id: 'orange', label: 'Laranja', swatch: '#F97316' },
  { id: 'yellow', label: 'Amarelo', swatch: '#EAB308' },
  { id: 'slate', label: 'Grafite', swatch: '#64748B' },
]

/** Fundos prontos. `null` = padrão do modo (verde escuro / branco azulado). */
export const BACKGROUNDS: Record<ThemeMode, { label: string; hex: string | null }[]> = {
  dark: [
    { label: 'Padrão', hex: null },
    { label: 'Azul-noite', hex: '#08122B' },
    { label: 'Roxo', hex: '#130C26' },
    { label: 'Grafite', hex: '#121417' },
    { label: 'Preto', hex: '#000000' },
    { label: 'Vinho', hex: '#1F0A12' },
    { label: 'Marrom', hex: '#1A110A' },
  ],
  light: [
    { label: 'Padrão', hex: null },
    { label: 'Branco', hex: '#FFFFFF' },
    { label: 'Cinza', hex: '#EEF0F2' },
    { label: 'Creme', hex: '#FBF6EC' },
    { label: 'Menta', hex: '#E8F7F1' },
    { label: 'Azul', hex: '#E8F0FE' },
    { label: 'Rosa', hex: '#FDEEF3' },
  ],
}

const KEY = 'money-theme'

export interface ThemeState {
  mode: ThemeMode
  /** Cor pronta, ou 'custom' para usar `customAccent`. */
  accent: Accent | 'custom'
  customAccent: string
  /** Cor de fundo de cada modo (null = padrão). */
  bgDark: string | null
  bgLight: string | null
}

export const DEFAULT_THEME: ThemeState = { mode: 'dark', accent: 'green', customAccent: '#4FD1C5', bgDark: null, bgLight: null }

// ---------- utilitários de cor ----------
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return [h, s * 100, l * 100]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const S = s / 100
  const L = l / 100
  const c = (1 - Math.abs(2 * L - 1)) * S
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = L - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

const toHex = ([r, g, b]: [number, number, number]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
const hsl = (h: number, s: number, l: number) => toHex(hslToRgb(h, s, l))
const triplet = (rgb: [number, number, number]) => rgb.join(' ')

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const
const STEP_LIGHTNESS = [96, 91, 84, 74, 65, 57, 48, 39, 30, 22]

/** Escala 50–900 a partir da matiz/saturação da cor escolhida (o brilho é padronizado para manter contraste). */
function shadesFromHex(hex: string) {
  const [h, s] = hexToHsl(hex)
  const sat = clamp(s, 45, 90)
  return STEPS.map((step, i) => ({ step, rgb: hslToRgb(h, sat, STEP_LIGHTNESS[i]) }))
}

// ---------- ícone da aba (muda junto com a cor) ----------
const FAVICON_COLORS: Record<Accent, { bg1: string; bg2: string; coin1: string; coin2: string }> = {
  green: { bg1: '#9AF2D6', bg2: '#3FC4B6', coin1: '#B9F3E2', coin2: '#5ECBAF' },
  teal: { bg1: '#6EE7B7', bg2: '#10B981', coin1: '#D1FAE5', coin2: '#34D399' },
  blue: { bg1: '#93C5FD', bg2: '#3B82F6', coin1: '#DBEAFE', coin2: '#60A5FA' },
  indigo: { bg1: '#A5B4FC', bg2: '#6366F1', coin1: '#E0E7FF', coin2: '#818CF8' },
  violet: { bg1: '#C4B5FD', bg2: '#8B5CF6', coin1: '#EDE9FE', coin2: '#A78BFA' },
  pink: { bg1: '#F9A8D4', bg2: '#EC4899', coin1: '#FCE7F3', coin2: '#F472B6' },
  red: { bg1: '#FCA5A5', bg2: '#EF4444', coin1: '#FEE2E2', coin2: '#F87171' },
  orange: { bg1: '#FDBA74', bg2: '#F97316', coin1: '#FFEDD5', coin2: '#FB923C' },
  yellow: { bg1: '#FDE047', bg2: '#EAB308', coin1: '#FEF9C3', coin2: '#FACC15' },
  slate: { bg1: '#CBD5E1', bg2: '#64748B', coin1: '#F1F5F9', coin2: '#94A3B8' },
}

function faviconColors(t: ThemeState) {
  if (t.accent !== 'custom') return FAVICON_COLORS[t.accent]
  const s = shadesFromHex(t.customAccent)
  const at = (step: number) => toHex(s.find((x) => x.step === step)!.rgb)
  return { bg1: at(300), bg2: at(500), coin1: at(100), coin2: at(400) }
}

function faviconSvg(t: ThemeState) {
  const c = faviconColors(t)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.bg1}"/><stop offset="1" stop-color="${c.bg2}"/></linearGradient>` +
    `<linearGradient id="coin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.coin1}"/><stop offset="1" stop-color="${c.coin2}"/></linearGradient></defs>` +
    `<rect width="512" height="512" rx="116" fill="url(#bg)"/>` +
    `<rect x="150" y="118" width="212" height="84" rx="26" fill="#04241C" opacity="0.5"/>` +
    `<rect x="104" y="170" width="304" height="212" rx="58" fill="#04241C"/>` +
    `<circle cx="338" cy="276" r="34" fill="url(#coin)"/><circle cx="338" cy="276" r="12" fill="#04241C"/></svg>`
  )
}

function applyFavicon(t: ThemeState) {
  const href = `data:image/svg+xml,${encodeURIComponent(faviconSvg(t))}`
  document.querySelectorAll('link[rel~="icon"]').forEach((el) => el.remove())
  const link = document.createElement('link')
  link.rel = 'icon'
  link.type = 'image/svg+xml'
  link.href = href
  document.head.appendChild(link)
}

// ---------- persistência ----------
/** Valida um tema vindo do localStorage ou da conta; devolve null se não for um tema. */
export function normalizeTheme(p: unknown): ThemeState | null {
  if (!p || typeof p !== 'object') return null
  const o = p as Record<string, unknown>
  const accent: ThemeState['accent'] =
    o.accent === 'custom' ? 'custom' : ACCENTS.some((a) => a.id === o.accent) ? (o.accent as Accent) : 'green'
  return {
    mode: o.mode === 'light' ? 'light' : 'dark',
    accent,
    customAccent: isHex(o.customAccent) ? o.customAccent : DEFAULT_THEME.customAccent,
    bgDark: isHex(o.bgDark) ? o.bgDark : null,
    bgLight: isHex(o.bgLight) ? o.bgLight : null,
  }
}

export function loadTheme(): ThemeState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return normalizeTheme(JSON.parse(raw)) ?? DEFAULT_THEME
  } catch {
    /* localStorage indisponível: usa o padrão */
  }
  return DEFAULT_THEME
}

export const sameTheme = (a: ThemeState, b: ThemeState) => JSON.stringify(a) === JSON.stringify(b)

/** Chave onde a escolha fica guardada na conta (user_metadata do login). */
export const ACCOUNT_THEME_KEY = 'money_theme'

const BG_VARS = ['--c-bg', '--c-bg-soft', '--aurora', '--c-modal', '--chart-tooltip-bg', '--option-bg']

export function applyTheme(t: ThemeState) {
  const root = document.documentElement
  root.dataset.mode = t.mode
  root.dataset.accent = t.accent === 'custom' ? 'green' : t.accent

  // cor de destaque personalizada: sobrescreve a escala --a-50..900
  for (const step of STEPS) root.style.removeProperty(`--a-${step}`)
  if (t.accent === 'custom') {
    for (const { step, rgb } of shadesFromHex(t.customAccent)) root.style.setProperty(`--a-${step}`, triplet(rgb))
  }

  // cor de fundo (cada modo guarda a sua); null = padrão do CSS
  for (const v of BG_VARS) root.style.removeProperty(v)
  const bg = t.mode === 'dark' ? t.bgDark : t.bgLight
  let themeColor = t.mode === 'light' ? '#F3F7F6' : '#030B09'
  if (bg) {
    const [h, s, l0] = hexToHsl(bg)
    const dark = t.mode === 'dark'
    const l = dark ? clamp(l0, 2, 24) : clamp(l0, 90, 100)
    const sat = clamp(s, 0, dark ? 70 : 80)
    const base = hsl(h, sat, l)
    themeColor = base
    const mid = hsl(h, sat, dark ? l + 4 : l - 2)
    const end = hsl(h, sat, dark ? l + 1.5 : l - 5)
    const glow = dark ? [0.16, 0.13, 0.1] : [0.3, 0.12, 0.18]
    root.style.setProperty('--c-bg', base)
    root.style.setProperty('--c-bg-soft', hsl(h, sat, dark ? l + 2 : Math.min(100, l + 2)))
    root.style.setProperty(
      '--aurora',
      `radial-gradient(ellipse 900px 520px at 12% -8%, rgb(var(--a-300) / ${glow[0]}), transparent 60%), ` +
        `radial-gradient(ellipse 820px 620px at 105% 8%, rgba(157, 125, 232, ${glow[1]}), transparent 55%), ` +
        `radial-gradient(ellipse 900px 700px at 50% 105%, rgb(var(--a-500) / ${glow[2]}), transparent 60%), ` +
        `linear-gradient(180deg, ${base} 0%, ${mid} 42%, ${end} 100%)`
    )
    root.style.setProperty('--c-modal', dark ? `linear-gradient(155deg, ${hsl(h, sat, l + 7)} 0%, ${hsl(h, sat, l + 3)} 100%)` : hsl(h, sat, Math.min(100, l + 4)))
    root.style.setProperty('--chart-tooltip-bg', dark ? hsl(h, sat, l + 4) : '#ffffff')
    root.style.setProperty('--option-bg', dark ? hsl(h, sat, l + 5) : '#ffffff')
  }

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', themeColor)
  applyFavicon(t)
}

export function saveTheme(t: ThemeState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(t))
  } catch {
    /* ignora */
  }
  applyTheme(t)
  window.dispatchEvent(new CustomEvent('money-theme-change', { detail: t }))
}

let pushTimer: ReturnType<typeof setTimeout> | undefined
let pushPending = false
/** true enquanto uma escolha recente ainda está sendo enviada para a conta (não deixa a versão antiga sobrescrever). */
export const hasPendingThemePush = () => pushPending
/** Guarda a escolha na conta do usuário (com pequena espera para não gravar a cada arrasto do seletor). */
export function pushThemeToAccount(t: ThemeState) {
  clearTimeout(pushTimer)
  pushPending = true
  pushTimer = setTimeout(() => {
    void supabase.auth
      .updateUser({ data: { [ACCOUNT_THEME_KEY]: t } })
      .finally(() => {
        pushPending = false
      })
  }, 700)
}
