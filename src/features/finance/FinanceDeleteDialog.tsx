import { useId, useState } from 'react'
import { CalendarDays, CircleAlert, Info, Trash2, X } from 'lucide-react'
import { formatDateTimeWib, formatRupiah } from '@/lib/format'
import { apiError } from '@/lib/api-error'
import { id } from '@/lib/i18n/id'
import type { FinanceRecord } from './finance-data'
import { MenuDialog } from '@/features/menu-admin/MenuDialog'

function poolLabel(pool: FinanceRecord['pool']) {
  if (pool === 'restock') return id.finance.pools.restock
  if (pool === 'operating') return id.finance.pools.operating
  return id.finance.pools.profit
}

export function FinanceDeleteDialog({
  record,
  onClose,
  onConfirm,
}: {
  record: FinanceRecord
  onClose: () => void
  onConfirm: () => Promise<void>
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
    } catch (confirmationError) {
      setError(apiError(confirmationError))
      setIsPending(false)
    }
  }

  return (
    <MenuDialog
      labelledBy={titleId}
      describedBy={descriptionId}
      className="finance-delete-dialog"
      role="alertdialog"
      onClose={() => { if (!isPending) onClose() }}
    >
      <section className="finance-delete-panel">
        <header className="finance-delete-heading">
          <span className="finance-delete-icon" aria-hidden="true"><Trash2 /></span>
          <div>
            <span className="finance-delete-eyebrow">{id.finance.deleteEyebrow}</span>
            <h2 id={titleId}>{id.finance.deleteTitle}</h2>
          </div>
          <button type="button" className="finance-dialog-close" aria-label={id.finance.closeDialog} disabled={isPending} onClick={onClose}><X aria-hidden="true" /></button>
        </header>

        <div className="finance-selected-record" id={descriptionId}>
          <div className="finance-selected-top"><span>{id.finance.selectedTransaction}</span><span className={`finance-type-chip is-${record.type}`}>{record.type === 'expense' ? id.finance.expense : id.finance.income}</span></div>
          <div className="finance-selected-main">
            <strong>{record.category}</strong>
            <span className={`finance-selected-amount is-${record.type}`}>{formatRupiah(record.amount)}</span>
          </div>
          <p><CalendarDays aria-hidden="true" />{formatDateTimeWib(record.date)}<span aria-hidden="true">·</span>{id.finance.poolPrefix} {poolLabel(record.pool)}</p>
        </div>

        <p className="finance-delete-warning"><CircleAlert aria-hidden="true" />{id.finance.deleteWarning}</p>
        <p className="finance-delete-info"><Info aria-hidden="true" /><span>{id.finance.deleteImpact} <strong>{poolLabel(record.pool)}</strong> {id.finance.deleteImpactSuffix}</span></p>
        {error && <p className="finance-delete-error" role="alert">{error}</p>}

        <footer className="finance-delete-actions">
          <button type="button" className="finance-delete-cancel" disabled={isPending} onClick={onClose}>{id.finance.cancel}</button>
          <button type="button" className="finance-delete-confirm" disabled={isPending} onClick={() => void confirm()}><Trash2 aria-hidden="true" />{isPending ? id.finance.deleting : id.finance.delete}</button>
        </footer>
      </section>
    </MenuDialog>
  )
}
