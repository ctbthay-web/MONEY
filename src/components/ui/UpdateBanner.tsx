import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

// O Money é um app de página única: uma aba (ou o app instalado) aberta antes de um deploy continua com a versão
// antiga. Aqui conferimos de tempos em tempos se o index.html publicado aponta para outro arquivo principal e,
// se sim, oferecemos atualizar com um toque.
const CHECK_EVERY_MS = 5 * 60 * 1000

function currentEntry(): string | null {
  const s = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')
  return s?.getAttribute('src') ?? null
}

async function publishedEntry(): Promise<string | null> {
  try {
    const res = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const html = await res.text()
    return html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1] ?? null
  } catch {
    return null
  }
}

export function UpdateBanner() {
  const [outdated, setOutdated] = useState(false)

  useEffect(() => {
    const mine = currentEntry()
    if (!mine) return // ambiente de desenvolvimento: não há arquivo com hash
    let stopped = false
    const check = async () => {
      if (stopped || document.visibilityState !== 'visible') return
      const latest = await publishedEntry()
      if (!stopped && latest && latest !== mine) setOutdated(true)
    }
    const onVisible = () => void check()
    document.addEventListener('visibilitychange', onVisible)
    const id = setInterval(check, CHECK_EVERY_MS)
    void check()
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(id)
    }
  }, [])

  if (!outdated) return null
  return (
    <div className="fixed inset-x-0 top-3 z-[60] flex justify-center px-4" role="status">
      <button
        onClick={() => window.location.reload()}
        className="glass flex items-center gap-2 rounded-full px-4 py-2 text-sm text-ink-primary shadow-soft"
      >
        <RefreshCw className="h-4 w-4 text-brand-300" />
        Nova versão disponível
        <span className="font-semibold text-brand-300">Atualizar</span>
      </button>
    </div>
  )
}
