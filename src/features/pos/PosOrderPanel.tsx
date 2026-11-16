import { Banknote, Minus, Plus, QrCode, ShoppingCart, Trash2 } from 'lucide-react'
import { formatRupiah } from '@/lib/format'
import { id } from '@/lib/i18n/id'
import { getLineSubtotal } from '@/features/pos/pos-types'
import type { CartLine, PaymentMethod, ServiceMode } from '@/features/pos/pos-types'

type PosOrderPanelProps = {
  lines: CartLine[]
  total: number
  quantityCount: number
  tableCount: number
  serviceMode: ServiceMode
  tableNo: number | 'TA'
  paymentMethod: PaymentMethod
  cashReceived: string
  canComplete: boolean
  onComplete: () => void
  onServiceModeChange: (mode: ServiceMode) => void
  onTableChange: (tableNo: number) => void
  onPaymentMethodChange: (method: PaymentMethod) => void
  onCashReceivedChange: (amount: string) => void
  onSetCashReceived: (amount: number) => void
  onClearCart: () => void
  onRemove: (key: string) => void
  onQuantityChange: (key: string, quantity: number) => void
  onEdit: (line: CartLine) => void
}

export function PosOrderPanel({
  lines,
  total,
  quantityCount,
  tableCount,
  serviceMode,
  tableNo,
  paymentMethod,
  cashReceived,
  canComplete,
  onComplete,
  onServiceModeChange,
  onTableChange,
  onPaymentMethodChange,
  onCashReceivedChange,
  onSetCashReceived,
  onClearCart,
  onRemove,
  onQuantityChange,
  onEdit,
}: PosOrderPanelProps) {
  const received = Number.parseInt(cashReceived || '0', 10) || 0
  const difference = received - total

  return (
    <aside className="pos-order-panel" aria-label={id.pos.orderPanel}>
      <header className="pos-order-heading">
        <div className="pos-order-title-wrap">
          <ShoppingCart size={24} aria-hidden="true" />
          <h2>{id.pos.orderPanel}</h2>
          <span className="pos-order-count">{lines.length} {id.pos.itemCount}</span>
        </div>
        <button className="pos-clear-button" type="button" onClick={onClearCart} disabled={lines.length === 0}>
          <Trash2 size={16} aria-hidden="true" />
          <span>{id.pos.clearCart}</span>
        </button>
      </header>

      <div className="pos-service-controls">
        <span className="pos-service-label">{id.pos.serviceMode}</span>
        <div className="pos-service-options" role="group" aria-label={id.pos.serviceMode}>
          <button type="button" aria-pressed={serviceMode === 'dine-in'} className={serviceMode === 'dine-in' ? 'is-selected' : ''} onClick={() => onServiceModeChange('dine-in')}>
            {id.pos.dineIn}
          </button>
          <button type="button" aria-pressed={serviceMode === 'take-away'} className={serviceMode === 'take-away' ? 'is-selected' : ''} onClick={() => onServiceModeChange('take-away')}>
            {id.pos.takeAway}
          </button>
        </div>
        {serviceMode === 'dine-in' ? (
          <label className="pos-table-select">
            <span>{id.pos.table}</span>
            <select value={typeof tableNo === 'number' ? tableNo : 1} onChange={(event) => onTableChange(Number(event.target.value))}>
              {Array.from({ length: tableCount }, (_, index) => {
                const tableNumber = index + 1
                return <option key={tableNumber} value={tableNumber}>{id.pos.tableNumber.replace('{number}', String(tableNumber).padStart(2, '0'))}</option>
              })}
            </select>
          </label>
        ) : (
          <div className="pos-takeaway-table"><span>{id.pos.table}</span><strong>TA</strong></div>
        )}
      </div>

      <div className={`pos-cart-list${lines.length === 0 ? ' is-empty' : ''}`}>
        {lines.length === 0 ? (
          <div className="pos-empty-cart" role="status"><span className="pos-empty-cart-icon" aria-hidden="true"><ShoppingCart size={32} /></span>{id.pos.emptyCart}</div>
        ) : (
          lines.map((line) => (
            <article className="pos-cart-line" key={line.key}>
              <div className="pos-cart-line-heading">
                <div>
                  <h3>{line.menu.name}</h3>
                  <span className="pos-cart-line-total">{formatRupiah(getLineSubtotal(line))}</span>
                </div>
                <button className="pos-cart-remove" type="button" onClick={() => onRemove(line.key)} aria-label={`${id.pos.removeItem}: ${line.menu.name}`}>
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
              {line.modifiers.length > 0 && (
                <p className="pos-cart-modifiers">{line.modifiers.map((modifier) => modifier.name).join(', ')}</p>
              )}
              {line.note && <p className="pos-cart-note">{id.pos.notePrefix} {line.note}</p>}
              <div className="pos-cart-line-actions">
                <button className="pos-edit-options" type="button" onClick={() => onEdit(line)}>{id.pos.editOptions}</button>
                <div className="pos-quantity-control is-compact" aria-label={id.pos.quantity}>
                  <button type="button" onClick={() => onQuantityChange(line.key, line.quantity - 1)} disabled={line.quantity <= 1} aria-label={id.pos.decreaseQuantity}>
                    <Minus size={15} aria-hidden="true" />
                  </button>
                  <output>{line.quantity}</output>
                  <button type="button" onClick={() => onQuantityChange(line.key, line.quantity + 1)} aria-label={id.pos.increaseQuantity}>
                    <Plus size={15} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      <div className="pos-subtotal-row">
        <span>{id.pos.subtotal} ({quantityCount} {id.pos.orders})</span>
        <strong>{formatRupiah(total)}</strong>
      </div>

      <div className="pos-total-card">
        <span>{id.pos.totalPayment}</span>
        <strong>{formatRupiah(total)}</strong>
      </div>

      <section className="pos-payment-section" aria-labelledby="pos-payment-title">
        <h3 id="pos-payment-title">{id.pos.paymentMethod}</h3>
        <div className="pos-payment-methods" role="group" aria-label={id.pos.paymentMethod}>
          <button type="button" className={paymentMethod === 'cash' ? 'is-selected' : ''} aria-pressed={paymentMethod === 'cash'} onClick={() => onPaymentMethodChange('cash')}>
            <Banknote size={19} aria-hidden="true" />{id.pos.cash}
          </button>
          <button type="button" className={paymentMethod === 'qris' ? 'is-selected' : ''} aria-pressed={paymentMethod === 'qris'} onClick={() => onPaymentMethodChange('qris')}>
            <QrCode size={19} aria-hidden="true" />{id.pos.qris}
          </button>
        </div>

        {paymentMethod === 'cash' ? (
          <div className="pos-cash-entry">
            <label htmlFor="pos-cash-received">{id.pos.cashReceived}</label>
            <div className="pos-cash-input-wrap">
              <span aria-hidden="true">Rp.</span>
              <input
                id="pos-cash-received"
                type="text"
                inputMode="numeric"
                value={cashReceived}
                onChange={(event) => onCashReceivedChange(event.target.value.replace(/[^0-9]/g, ''))}
                placeholder="0"
                aria-label={id.pos.cashReceived}
              />
            </div>
            <div className="pos-quick-cash" role="group" aria-label={id.pos.quickAmounts}>
              <button type="button" onClick={() => onSetCashReceived(total)}>{id.pos.exactCash}</button>
              {[20_000, 50_000, 100_000].map((amount) => (
                <button type="button" key={amount} onClick={() => onSetCashReceived(amount)}>{formatRupiah(amount)}</button>
              ))}
            </div>
            <div className={`pos-change-card${difference < 0 ? ' is-short' : ''}`} role="status" aria-live="polite">
              <span>{difference < 0 ? id.pos.shortfall : id.pos.change}</span>
              <strong>{formatRupiah(Math.abs(difference))}</strong>
            </div>
          </div>
        ) : (
          <p className="pos-qris-notice"><QrCode size={18} aria-hidden="true" /><span>{id.pos.qrisNotice}</span></p>
        )}
      </section>

      <button className="pos-complete-button" type="button" disabled={!canComplete} onClick={onComplete}>
        <Banknote size={20} aria-hidden="true" />
        <span>{id.pos.completeTransaction}</span>
      </button>
    </aside>
  )
}
