import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, BadgeCheck, Banknote, CheckCircle2, CreditCard, QrCode, ReceiptText, TriangleAlert, X } from 'lucide-react'
import { formatRupiah } from '@/lib/format'
import { apiError } from '@/lib/api-error'
import { id } from '@/lib/i18n/id'
import { supabase } from '@/lib/supabase/client'
import type { CartLine, PaymentMethod } from '@/features/pos/pos-types'
import type { CheckoutMeta } from '@/features/pos/use-checkout-meta'
import './checkout.css'

type PosCheckoutDialogProps = {
  lines: CartLine[]
  total: number
  tableNo: number | 'TA'
  paymentMethod: PaymentMethod
  cashReceived: number
  checkoutMeta: CheckoutMeta | null
  metaLoading: boolean
  metaError: boolean
  onRetryMeta: () => void
  qrisOwnerName: string | null
  qrisImageUrl: string | null
  onClose: () => void
  onComplete: (transactionId: number) => void
}

function getCheckoutError(error: unknown): string {
  const message = apiError(error)
  if (/Cash received must cover/i.test(message)) return id.pos.checkoutCashShort
  if (/modifier group requirements|modifier selection|selected modifier/i.test(message)) return id.pos.checkoutOptionsChanged
  if (/menu item is unavailable|A selected modifier is unavailable/i.test(message)) return id.pos.checkoutMenuChanged
  return id.pos.checkoutFailed
}

function formatOrderPreview(meta: CheckoutMeta | null): string {
  if (!meta) return id.pos.loadingOrderNumber
  return `#TRX-${meta.order_date.replaceAll('-', '')}-${String(meta.next_order_no).padStart(4, '0')}`
}

function formatTable(tableNo: number | 'TA'): string {
  return tableNo === 'TA' ? 'TA' : id.pos.tableNumber.replace('{number}', String(tableNo).padStart(2, '0'))
}

export function PosCheckoutDialog({
  lines,
  total,
  tableNo,
  paymentMethod,
  cashReceived,
  checkoutMeta,
  metaLoading,
  metaError,
  onRetryMeta,
  qrisOwnerName,
  qrisImageUrl,
  onClose,
  onComplete,
}: PosCheckoutDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const tokenRef = useRef<string | null>(null)
  const submittingRef = useRef(false)
  const [qrisVerified, setQrisVerified] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const changeDue = Math.max(0, cashReceived - total)
  const metaReady = Boolean(checkoutMeta)
  const canConfirm = metaReady && !metaLoading && !isSubmitting && (paymentMethod === 'cash' || qrisVerified)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => {
      if (dialog?.open) dialog.close()
    }
  }, [])

  const handleConfirm = async () => {
    if (!canConfirm || submittingRef.current) return
    submittingRef.current = true
    setIsSubmitting(true)
    setSubmitError('')

    try {
      if (!tokenRef.current) {
        const tokenResult = await supabase.rpc('get_checkout_token')
        if (tokenResult.error) throw tokenResult.error
        if (typeof tokenResult.data !== 'string') throw new Error('Checkout token is unavailable')
        tokenRef.current = tokenResult.data
      }

      const { data, error } = await supabase.rpc('create_checkout', {
        p_token: tokenRef.current,
        p_table_no: String(tableNo),
        p_method: paymentMethod,
        p_paid: paymentMethod === 'qris' ? total : cashReceived,
        p_items: lines.map((line) => ({
          menu_id: line.menu.menu_id,
          quantity: line.quantity,
          modifier_ids: line.modifiers.map((modifier) => modifier.modifier_id),
          note: line.note || null,
        })),
      })
      if (error) throw error
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        throw new Error('Checkout result is unavailable')
      }

      const result = data as Record<string, unknown>
      const transactionId = Number(result.transaction_id)
      if (!Number.isSafeInteger(transactionId) || transactionId < 1) {
        throw new Error('Checkout result is invalid')
      }
      onComplete(transactionId)
    } catch (error) {
      setSubmitError(getCheckoutError(error))
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <dialog
      className={`pos-checkout-dialog${paymentMethod === 'qris' ? ' is-qris' : ' is-cash'}`}
      ref={dialogRef}
      aria-labelledby="pos-checkout-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!isSubmitting) onClose()
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current && !isSubmitting) onClose()
      }}
    >
      <form className="pos-checkout-content" onSubmit={(event) => { event.preventDefault(); void handleConfirm() }}>
        <header className="pos-checkout-header">
          <span className="pos-checkout-icon" aria-hidden="true">
            {paymentMethod === 'cash' ? <Banknote size={23} /> : <QrCode size={23} />}
          </span>
          <div className="pos-checkout-heading-copy">
            <h2 id="pos-checkout-title">{id.pos.checkoutTitle}</h2>
            {paymentMethod === 'cash' ? (
              <p className="pos-checkout-order-number">{id.pos.transactionNumber} {formatOrderPreview(checkoutMeta)}</p>
            ) : (
              <p>{id.pos.qrisSubtitle}</p>
            )}
          </div>
          <button className="pos-checkout-close" type="button" aria-label={id.pos.closeCheckout} onClick={onClose} disabled={isSubmitting}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        {paymentMethod === 'cash' ? (
          <section className="pos-checkout-cash-summary" aria-label={id.pos.checkoutSummary}>
            <div className="pos-checkout-summary-row">
              <span><ReceiptText size={17} aria-hidden="true" />{id.pos.totalPaymentLabel}</span>
              <strong>{formatRupiah(total)}</strong>
            </div>
            <div className="pos-checkout-summary-row">
              <span><CreditCard size={17} aria-hidden="true" />{id.pos.paymentMethodLabel}</span>
              <strong className="pos-payment-chip"><Banknote size={13} aria-hidden="true" />{id.pos.cashChip}</strong>
            </div>
            <div className="pos-checkout-summary-row">
              <span><Banknote size={17} aria-hidden="true" />{id.pos.cashReceivedLabel}</span>
              <strong>{formatRupiah(cashReceived)}</strong>
            </div>
            <div className="pos-checkout-change-row">
              <div>
                <strong>{id.pos.changeLabel}</strong>
                <span>{id.pos.changeReminder}</span>
              </div>
              <strong>{formatRupiah(changeDue)}</strong>
            </div>
            <div className="pos-checkout-summary-row is-table">
              <span>{id.pos.table}</span>
              <strong>{formatTable(tableNo)}</strong>
            </div>
          </section>
        ) : (
          <>
            <section className="pos-checkout-qris-summary" aria-label={id.pos.checkoutSummary}>
              <div className="pos-checkout-summary-row">
                <span>{id.pos.totalPaymentLabel}</span>
                <strong>{formatRupiah(total)}</strong>
              </div>
              <div className="pos-checkout-summary-row">
                <span>{id.pos.paymentMethodLabel}</span>
                <strong className="pos-payment-chip"><QrCode size={13} aria-hidden="true" />{id.pos.qrisChip}</strong>
              </div>
              <div className="pos-checkout-summary-row is-table">
                <span>{id.pos.table}</span>
                <strong>{formatTable(tableNo)}</strong>
              </div>
            </section>

            <section className="pos-qris-confirm-card" aria-label={id.pos.qrisDetails}>
              <p className="pos-qris-owner"><BadgeCheck size={18} aria-hidden="true" /><strong>{qrisOwnerName || id.pos.qrisOwnerMissing}</strong><span>{id.pos.verified}</span></p>
              <div className="pos-qris-image-card">
                {qrisImageUrl ? (
                  <img src={qrisImageUrl} alt={id.pos.qrisImageAlt} />
                ) : (
                  <p>{id.pos.qrisImageMissing}</p>
                )}
                <strong>{id.pos.nominal}: {formatRupiah(total)}</strong>
              </div>
            </section>

            <div className="pos-checkout-warning" role="note">
              <TriangleAlert size={19} aria-hidden="true" />
              <p>{id.pos.checkoutWarning}</p>
            </div>

            <label className="pos-qris-verification">
              <input type="checkbox" checked={qrisVerified} onChange={(event) => setQrisVerified(event.target.checked)} disabled={isSubmitting} />
              <span>{id.pos.qrisVerification.replace('{amount}', formatRupiah(total))}</span>
            </label>
          </>
        )}

        {metaLoading && !checkoutMeta && <p className="pos-checkout-inline-state" role="status">{id.pos.loadingCheckoutMeta}</p>}
        {metaError && !checkoutMeta && (
          <div className="pos-checkout-inline-error" role="alert">
            <span>{id.pos.checkoutMetaError}</span>
            <button type="button" onClick={onRetryMeta}>{id.pos.retry}</button>
          </div>
        )}
        {submitError && <p className="pos-checkout-inline-error" role="alert">{submitError}</p>}

        <footer className="pos-checkout-actions">
          <button className="pos-checkout-cancel" type="button" onClick={onClose} disabled={isSubmitting}>
            {paymentMethod === 'cash' && <ArrowLeft size={18} aria-hidden="true" />}
            {paymentMethod === 'cash' ? id.pos.cancelCash : id.pos.cancel}
          </button>
          <button className="pos-checkout-confirm" type="submit" disabled={!canConfirm}>
            <CheckCircle2 size={19} aria-hidden="true" />
            <span>{isSubmitting ? id.pos.checkoutSaving : id.pos.checkoutConfirm}</span>
          </button>
        </footer>
      </form>
    </dialog>
  )
}
