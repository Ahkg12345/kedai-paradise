import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { formatDateTimeWib } from '@/lib/format'
import { id } from '@/lib/i18n/id'
import { supabase } from '@/lib/supabase/client'
import './receipt.css'

type ReceiptModifier = { name: string; price: number }
type ReceiptOrder = {
  order_id: number
  quantity: number
  name: string
  price: number
  modifier_price: number
  subtotal: number
  modifiers: ReceiptModifier[]
}
type ReceiptTransaction = {
  transaction_id: number
  order_no: number
  date: string
  table_no: string
  method: 'cash' | 'qris'
  total: number
  paid: number
  change_due: number
  status: 'processing' | 'completed' | 'void'
  username: string
}
type ReceiptSettings = {
  business_name: string
  business_address: string | null
  receipt_footer: string | null
}
type ReceiptPayload = {
  transaction: ReceiptTransaction
  orders: ReceiptOrder[]
  settings: ReceiptSettings | null
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(value)
}

function formatMethod(method: ReceiptTransaction['method']): string {
  return method === 'cash' ? id.pos.cash : id.pos.qris
}

async function fetchReceipt(transactionId: number): Promise<ReceiptPayload> {
  const { data, error } = await supabase.rpc('get_order_receipt', { p_transaction_id: transactionId })
  if (error) throw error
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('Receipt data is unavailable')
  const payload = data as unknown as ReceiptPayload
  if (!payload.transaction || !Array.isArray(payload.orders)) throw new Error('Receipt data is invalid')
  return payload
}

export function ReceiptPage() {
  const { id: routeId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const transactionId = Number(routeId)
  const validTransactionId = Boolean(routeId && /^\d+$/.test(routeId) && Number.isSafeInteger(transactionId) && transactionId > 0)
  const paper = searchParams.get('paper') === '80' ? '80' : '58'
  const isReprint = searchParams.get('reprint') === '1'
  const routeState = location.state as { fromHistory?: boolean } | null
  const openedFromHistory = isReprint || routeState?.fromHistory === true
  const receiptQuery = useQuery({
    queryKey: ['order-receipt', transactionId],
    queryFn: () => fetchReceipt(transactionId),
    enabled: validTransactionId,
    staleTime: 30_000,
  })

  const handleReturn = () => {
    if (openedFromHistory) {
      window.close()
      if (!window.closed) navigate('/riwayat', { replace: true })
      return
    }
    navigate('/kasir')
  }

  if (!validTransactionId) {
    return <main className="receipt-state" role="alert">{id.receipt.notFound}</main>
  }

  if (receiptQuery.isPending) {
    return <main className="receipt-state" role="status" aria-busy="true">{id.receipt.loading}</main>
  }

  if (receiptQuery.isError || !receiptQuery.data) {
    return (
      <main className="receipt-state" role="alert">
        <p>{id.receipt.notFound}</p>
        <button type="button" onClick={handleReturn}>{id.receipt.back}</button>
      </main>
    )
  }

  const { transaction, orders, settings } = receiptQuery.data

  return (
    <main className="receipt-page" data-paper={paper}>
      <article className={`receipt-paper${transaction.status === 'void' ? ' is-void' : ''}`} aria-label={id.receipt.title}>
        {isReprint && <p className="receipt-banner">*** {id.receipt.reprintBanner} ***</p>}
        {transaction.status === 'void' && <p className="receipt-banner is-void">*** {id.receipt.voidBanner} ***</p>}

        <header className="receipt-business-header">
          <h1>{settings?.business_name || id.brand}</h1>
          {settings?.business_address && <p>{settings.business_address}</p>}
        </header>

        <div className="receipt-dashed-separator" />

        <section className="receipt-meta" aria-label={id.receipt.orderDetails}>
          <div><span>{id.receipt.orderNumber}</span><strong>: {String(transaction.order_no).padStart(3, '0')}</strong></div>
          <div><span>{id.receipt.time}</span><strong>: {formatDateTimeWib(transaction.date)}</strong></div>
          <div><span>{id.pos.table}</span><strong>: {transaction.table_no === 'TA' ? 'TA' : id.pos.tableNumber.replace('{number}', String(Number(transaction.table_no)).padStart(2, '0'))}</strong></div>
          <div><span>{id.receipt.cashier}</span><strong>: {transaction.username}</strong></div>
        </section>

        <div className="receipt-dashed-separator" />

        <section className="receipt-items" aria-label={id.receipt.items}>
          {orders.map((order) => (
            <div className="receipt-item" key={order.order_id}>
              <div className="receipt-item-main">
                <span>{order.quantity} x {order.name}</span>
                <strong>{formatAmount(order.subtotal)}</strong>
              </div>
              {order.modifiers.length > 0 && (
                <p className="receipt-item-modifiers">[{order.modifiers.map((modifier) => modifier.name).join(', ')}]</p>
              )}
            </div>
          ))}
        </section>

        <div className="receipt-dashed-separator" />

        <div className="receipt-total-row">
          <strong>{id.receipt.total}</strong>
          <strong>{formatAmount(transaction.total)}</strong>
        </div>
        <section className="receipt-payment-details" aria-label={id.receipt.paymentDetails}>
          <div><span>{id.receipt.method}</span><strong>: {formatMethod(transaction.method)}</strong></div>
          <div><span>{id.receipt.paid}</span><strong>: {formatAmount(transaction.paid)}</strong></div>
          <div><span>{id.receipt.change}</span><strong>: {formatAmount(transaction.change_due)}</strong></div>
        </section>

        <div className="receipt-dashed-separator" />

        <div className="receipt-status" aria-label={id.receipt.status}>
          <span>{id.receipt.status}:</span>
          <strong>{transaction.status === 'void' ? id.receipt.void : transaction.status === 'completed' ? id.receipt.completed : id.receipt.processing}</strong>
        </div>
        {settings?.receipt_footer && <p className="receipt-footer-copy">{settings.receipt_footer}</p>}
      </article>

      <div className="receipt-torn-edge" aria-hidden="true" />

      <div className="receipt-actions">
        <button className="receipt-print-button" type="button" onClick={() => window.print()}>
          <Printer size={19} aria-hidden="true" />{id.receipt.print}
        </button>
        <button className="receipt-back-button" type="button" onClick={handleReturn}>
          <ArrowLeft size={19} aria-hidden="true" />{id.receipt.back}
        </button>
      </div>
    </main>
  )
}
