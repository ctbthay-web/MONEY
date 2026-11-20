import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button } from '../components/ui/Button'

export function NotFoundPage() {
  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
      <Compass className="h-10 w-10 text-brand-400" strokeWidth={1.5} />
      <h1 className="text-2xl font-bold text-ink-primary">Página não encontrada</h1>
      <p className="max-w-xs text-sm text-ink-secondary">A página que você procura não existe ou foi movida.</p>
      <Link to="/">
        <Button>Voltar ao início</Button>
      </Link>
    </div>
  )
}
