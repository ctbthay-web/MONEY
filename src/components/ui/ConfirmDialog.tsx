import { Modal } from './Modal'
import { Button } from './Button'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  loading?: boolean
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  loading,
  danger = true,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-ink-secondary">{description}</p>
      <div className="mt-6 flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          className="flex-1"
          onClick={onConfirm}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
