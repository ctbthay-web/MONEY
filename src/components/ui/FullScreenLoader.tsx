import { Loader2 } from 'lucide-react'

export function FullScreenLoader() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-bg">
      <Loader2 className="h-8 w-8 animate-spin text-brand-400" strokeWidth={2} />
    </div>
  )
}
