import { useId, useState } from 'react'
import { CircleAlert } from 'lucide-react'
import { apiError } from '@/lib/api-error'
import { id } from '@/lib/i18n/id'
import { MenuDialog } from './MenuDialog'

export function MenuConfirmDialog({
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm,
  onSuccess,
}: {
  title: string
  description: string
  confirmLabel: string
  onClose: () => void
  onConfirm: () => Promise<void>
  onSuccess?: () => void
}) {
  const titleId = useId()
  const descriptionId = useId()
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState('')

  const confirm = async () => {
    setError('')
    setIsPending(true)
    try {
      await onConfirm()
      onClose()
      onSuccess?.()
    } catch (confirmationError) {
      setError(apiError(confirmationError))
      setIsPending(false)
    }
  }

  return (
    <MenuDialog labelledBy={titleId} describedBy={descriptionId} className="menu-confirm-dialog" role="alertdialog" onClose={onClose}>
      <section className="menu-confirm-panel">
        <header className="menu-confirm-heading">
          <span className="menu-confirm-icon"><CircleAlert aria-hidden="true" /></span>
          <div>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
        </header>
        {error && <p className="menu-confirm-error" role="alert">{error}</p>}
        <footer className="menu-confirm-actions">
          <button type="button" className="menu-confirm-cancel" onClick={onClose} disabled={isPending}>{id.menuAdmin.cancel}</button>
          <button type="button" className="menu-confirm-submit" onClick={() => void confirm()} disabled={isPending}>
            {isPending ? id.menuAdmin.confirmPending : confirmLabel}
          </button>
        </footer>
      </section>
    </MenuDialog>
  )
}
