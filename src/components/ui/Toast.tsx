import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, XCircle, Info } from 'lucide-react'
import { cn } from '../../lib/cn'

type ToastKind = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

interface ToastContextValue {
  show: (kind: ToastKind, message: string) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

const kindStyles: Record<ToastKind, { icon: typeof CheckCircle2; classes: string; borderColor: string }> = {
  success: { icon: CheckCircle2, classes: 'text-brand-300', borderColor: 'rgb(var(--a-300) / 0.35)' },
  error: { icon: XCircle, classes: 'text-danger', borderColor: 'rgb(var(--danger) / 0.35)' },
  info: { icon: Info, classes: 'text-ink-secondary', borderColor: 'var(--c-border)' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const show = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, kind, message }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3500)
  }, [])

  const value: ToastContextValue = {
    show,
    success: (m) => show('success', m),
    error: (m) => show('error', m),
    info: (m) => show('info', m),
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 p-4 pt-[calc(1rem+env(safe-area-inset-top,0px))]">
          {toasts.map((t) => {
            const { icon: Icon, classes, borderColor } = kindStyles[t.kind]
            return (
              <div
                key={t.id}
                className={cn(
                  'glass solid-surface pointer-events-auto flex max-w-sm items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium shadow-soft motion-safe:animate-fade-in',
                  classes
                )}
                style={{ borderColor }}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="text-ink-primary">{t.message}</span>
              </div>
            )
          })}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider')
  return ctx
}
