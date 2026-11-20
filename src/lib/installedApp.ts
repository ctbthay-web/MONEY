/**
 * true quando o Money está aberto como app instalado/salvo (tela inicial do celular, "Instalar app" do
 * computador, atalho do iPhone) e não numa aba comum do navegador. Nesse caso nunca mostramos a página
 * de apresentação: quem tem conta entra direto, quem não tem vai para o acesso (login).
 */
export function isInstalledApp(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  if (nav.standalone === true) return true // iPhone/iPad ("Adicionar à Tela de Início")
  try {
    return ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'].some(
      (mode) => window.matchMedia(`(display-mode: ${mode})`).matches
    )
  } catch {
    return false
  }
}
