import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ArrowLeft, LoaderCircle, Trash2, X } from 'lucide-react'
import { formatRupiah } from '@/lib/format'
import { apiError } from '@/lib/api-error'
import { id } from '@/lib/i18n/id'
import { supabase } from '@/lib/supabase/client'
import type { HistoryRow } from './history-data'
import { fetchHistoryDetails } from './history-data'

type VoidOrderDialogProps = {
  row: HistoryRow
  onClose: () => void
  onSuccess: () => void
}

function tableLabel(tableNo: string) {
  return tableNo === 'TA' ? id.pos.takeAwayAbbreviation : id.pos.tableNumber.replace('{number}', String(Number(tableNo)).padStart(2, '0'))
}

export function VoidOrderDialog({ row, onClose, onSuccess }: VoidOrderDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [validationError, setValidationError] = useState('')
  const detailsQuery = useQuery({
    queryKey: ['history-details', row.transaction_id],
    queryFn: () => fetchHistoryDetails(row.transaction_id),
    staleTime: 30_000,
  })
  const mutation = useMutation({
    mutationFn: async (value: string) => {
      const { error } = await supabase.rpc('void_order', { p_transaction_id: row.transaction_id, p_reason: value })
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['history-details', row.transaction_id] })
      onSuccess()
    },
  })

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    textareaRef.current?.focus()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanReason = reason.trim()
    if (cleanReason.length < 3 || cleanReason.length > 255) {
      setValidationError(id.history.voidDialog.validation)
      return
    }
    setValidationError('')
    mutation.mutate(cleanReason)
  }

  const closeDialog = () => {
    if (mutation.isPending) return
    onClose()
  }
  const items = detailsQuery.data?.items ?? []
  const summary = items.map((item) => `${item.quantity}x ${item.name}${item.modifiers.length ? ` [${item.modifiers.join(', ')}]` : ''}`).join(' • ')
  const warningLines = id.history.voidDialog.warningLines

  return (
    <dialog
      className="void-dialog"
      ref={dialogRef}
      aria-labelledby="void-dialog-title"
      onCancel={(event) => { event.preventDefault(); closeDialog() }}
      onClick={(event) => { if (event.target === event.currentTarget) closeDialog() }}
    >
      <div className="void-dialog-content">
        <header className="void-dialog-heading">
          <div className="void-dialog-icon"><AlertCircle size={27} aria-hidden="true" /></div>
          <div className="void-dialog-title-copy">
            <h2 id="void-dialog-title">{id.history.voidDialog.title.replace('{order}', String(row.order_no).padStart(3, '0'))}</h2>
            <p>{id.history.voidDialog.subtitle}</p>
          </div>
          <button className="void-dialog-close" type="button" aria-label={id.history.closeVoidDialog} onClick={closeDialog} disabled={mutation.isPending}><X size={20} aria-hidden="true" /></button>
        </header>

        <div className="void-order-summary">
          <span className="void-summary-table">{tableLabel(row.table_no)}</span>
          <span aria-hidden="true">•</span>
          <span className="void-summary-method">{row.method === 'cash' ? id.history.cash : id.history.qris}</span>
          <span aria-hidden="true">•</span>
          <span className="void-summary-items">{detailsQuery.isPending ? id.history.loading : summary || id.notAvailable}</span>
          <strong>{formatRupiah(row.total)}</strong>
        </div>

        <form className="void-dialog-form" onSubmit={submit}>
          <div className="void-reason-heading">
            <label htmlFor="void-reason">{id.history.voidDialog.reason} <span aria-hidden="true">*</span></label>
            <span>{id.history.voidDialog.audit}</span>
          </div>
          <textarea
            id="void-reason"
            ref={textareaRef}
            value={reason}
            maxLength={255}
            onChange={(event) => { setReason(event.target.value); setValidationError('') }}
            aria-invalid={Boolean(validationError || mutation.isError)}
            aria-describedby="void-reason-hint void-reason-count"
            required
          />
          <div className="void-reason-meta">
            <p id="void-reason-hint">{id.history.voidDialog.reasonHint}</p>
            <span id="void-reason-count">{id.history.voidDialog.count.replace('{count}', String(reason.length))}</span>
          </div>
          {(validationError || mutation.isError) && <p className="void-error" role="alert">{validationError || apiError(mutation.error)}</p>}

          <section className="void-critical-warning" aria-labelledby="void-warning-title">
            <h3 id="void-warning-title"><AlertCircle size={17} aria-hidden="true" />{id.history.voidDialog.critical}</h3>
            <ul>
              {warningLines.map((line, index) => <li key={index}>{line.replace('{order}', String(row.order_no).padStart(3, '0'))}</li>)}
            </ul>
          </section>

          <footer className="void-dialog-actions">
            <button className="void-cancel-button" type="button" onClick={closeDialog} disabled={mutation.isPending}><ArrowLeft size={18} aria-hidden="true" />{id.history.voidDialog.cancel}</button>
            <button className="void-confirm-button" type="submit" disabled={mutation.isPending || reason.trim().length < 3 || reason.trim().length > 255}>
              {mutation.isPending ? <LoaderCircle size={18} className="void-spin" aria-hidden="true" /> : <Trash2 size={18} aria-hidden="true" />}
              {mutation.isPending ? id.history.voidDialog.saving : id.history.voidDialog.confirm}
            </button>
          </footer>
        </form>
      </div>
    </dialog>
  )
}
