// Paleta de gráficos validada com scripts/validate_palette.js (skill dataviz) contra a
// superfície escura dos cards do app (~#0B1712, glass sobre o fundo aurora). Não usar
// cores fora desta lista em gráficos — elas passaram nos 6 checks (banda de luminosidade,
// croma, separação CVD, piso de visão normal e contraste). Ordem fixa, nunca embaralhar.
// Mantém os 8 hexadecimais do conjunto padrão validado (skill dataviz) sem alterações —
// substituir qualquer um deles pela cor de marca quebra a separação CVD entre vizinhos
// (testado: verde-marca no lugar do slot 6 falha o check de CVD contra o slot magenta).
export const CHART_CATEGORICAL = [
  '#3987e5', // 1 azul
  '#d95926', // 2 laranja
  '#199e70', // 3 água
  '#c98500', // 4 amarelo
  '#d55181', // 5 magenta
  '#008300', // 6 verde
  '#9085e9', // 7 violeta
  '#e66767', // 8 vermelho
] as const

export const CHART_INCOME = '#0D9488'
export const CHART_EXPENSE = '#E5484D'
export const CHART_LINE = 'var(--chart-line)'

export const CHART_GRID = 'var(--chart-grid)'
export const CHART_AXIS = 'var(--chart-axis)'
export const CHART_TEXT = 'var(--chart-text)'

export const CHART_TOOLTIP_BG = 'var(--chart-tooltip-bg)'
export const CHART_TOOLTIP_BORDER = '1px solid var(--c-border-strong)'
