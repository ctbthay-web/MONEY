import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          'relative w-full max-h-[92svh] overflow-y-auto rounded-t-4xl border border-border solid-surface p-6 shadow-soft',
          'sm:max-w-md sm:rounded-3xl',
          'motion-safe:animate-modal-in',
          className
        )}
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink-primary">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-secondary hover:bg-white/5 hover:text-ink-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}
