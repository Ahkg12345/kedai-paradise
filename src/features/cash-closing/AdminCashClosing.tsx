import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowDownToLine, Banknote, CalendarDays, Calculator, CircleAlert, CircleCheck, FileSpreadsheet, Info, LockKeyhole, TrendingUp, WalletCards } from 'lucide-react'
import { apiError } from '@/lib/api-error'
import { formatDateTimeWib, formatDateWib, formatRupiah, formatSignedRupiah } from '@/lib/format'
import { id } from '@/lib/i18n/id'
import { saveCashClosing, type CashClosingHistoryRow, type CashClosingPreview } from './cash-closing-data'

type AdminCashClosingProps = {
  selectedDate: string
  dates: string[]
  today: string
  preview: CashClosingPreview
  history: CashClosingHistoryRow[]
  onDateChange: (date: string) => void
}

function numberWithSign(value: number) {
  const amount = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.abs(value))
  return `${value > 0 ? '+' : value < 0 ? '-' : ''}${amount}`
}

function csvCell(value: unknown) {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

function downloadHistory(rows: CashClosingHistoryRow[], separator: ',' | ';') {
  const headers = ['Closing date/time', 'Operator', 'Opening cash', 'Cash sales', 'Cash out', 'Expected cash', 'Counted cash', 'Difference', 'Note', 'Stale']
  const body = rows.map((row) => [
    row.created_at ? formatDateTimeWib(row.created_at) : formatDateWib(`${row.closing_date}T00:00:00+07:00`),
    row.username ?? '',
    row.opening_cash ?? '',
    row.cash_sales ?? '',
    row.cash_out ?? '',
    row.expected_cash,
    row.counted_cash,
    row.difference,
    row.note ?? '',
    row.stale ? 'true' : 'false',
  ])
  const csv = `\uFEFF${[headers, ...body].map((row) => row.map(csvCell).join(separator)).join('\r\n')}`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `riwayat-tutup-kasir-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function CashSummary({ preview }: { preview: CashClosingPreview }) {
  return (
    <section className="cash-summary-block" aria-labelledby="cash-summary-title">
      <h2 id="cash-summary-title"><TrendingUp size={19} aria-hidden="true" />{id.cashClosing.systemSummary}</h2>
      <div className="cash-summary-grid">
        <article><span>{id.cashClosing.cashSales}</span><strong>{formatRupiah(preview.cash_sales)}</strong><small><i aria-hidden="true" />{id.cashClosing.nonVoid}</small></article>
        <article><span>{id.cashClosing.qrisSales}</span><strong>{formatRupiah(preview.qris_sales)}</strong><small>{id.cashClosing.bankDeposit}</small></article>
        <article className="is-void"><span>{id.cashClosing.canceledOrders}</span><strong>{preview.void_count} {id.dashboard.ordersSuffix}</strong><small>{id.cashClosing.voidTotal.replace('{amount}', formatRupiah(preview.void_value))}</small></article>
      </div>
      {preview.processing_count > 0 && <p className="closing-processing-warning" role="status"><Info size={16} aria-hidden="true" />{id.cashClosing.processingWarning.replace('{count}', String(preview.processing_count))}</p>}
      {preview.closing?.stale && <p className="closing-stale-warning" role="status"><AlertTriangle size={16} aria-hidden="true" />{id.cashClosing.stale}</p>}
    </section>
  )
}

function CashAmountField({
  label,
  hint,
  value,
  onChange,
  inputId,
}: {
  label: string
  hint: string
  value: string
  onChange: (value: string) => void
  inputId: string
}) {
  return (
    <label className="cash-amount-field" htmlFor={inputId}>
      <span className="cash-amount-label"><strong>{label}</strong><small>IDR</small></span>
      <span className="cash-input-shell"><span>Rp</span><input id={inputId} type="number" min="0" step="1" inputMode="numeric" value={value} onChange={(event) => onChange(event.target.value)} /></span>
      <small className="cash-amount-hint">{hint}</small>
    </label>
  )
}

function CashDifference({ target, counted }: { target: number; counted: number | null }) {
  const difference = counted === null ? null : counted - target
  const state = difference === null ? 'is-pending' : difference === 0 ? 'is-even' : difference < 0 ? 'is-short' : 'is-surplus'
  const message = difference === null
    ? id.cashClosing.requiredAmount
    : difference === 0
      ? id.cashClosing.exactDifference
      : difference < 0
? id.cashClosing.shortDifference.replace('{amount}', formatSignedRupiah(difference))
      : id.cashClosing.surplusDifference.replace('{amount}', formatSignedRupiah(difference))

  return (
    <div className={`cash-difference-panel ${state}`} aria-live="polite">
      <div><strong>{difference === null ? id.cashClosing.requiredAmount : difference === 0 ? id.cashClosing.cashMatches : id.cashClosing.mismatch}</strong><span>{difference !== null && difference !== 0 && (difference < 0 ? id.cashClosing.shortfall : id.cashClosing.surplus)}</span></div>
      <span className="cash-difference-value">{difference !== null && difference === 0 ? <CircleCheck size={18} aria-hidden="true" /> : difference !== null ? <CircleAlert size={18} aria-hidden="true" /> : <Info size={18} aria-hidden="true" />}{message}</span>
    </div>
  )
}

export function AdminCashClosing({ selectedDate, dates, today, preview, history, onDateChange }: AdminCashClosingProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [openingCash, setOpeningCash] = useState(String(preview.closing?.opening_cash ?? 0))
  const [cashOut, setCashOut] = useState(String(preview.closing?.cash_out ?? 0))
  const [countedCash, setCountedCash] = useState(preview.closing ? String(preview.closing.counted_cash) : '')
  const [note, setNote] = useState(preview.closing?.note ?? '')
  const [formError, setFormError] = useState('')
  const mutation = useMutation({
    mutationFn: saveCashClosing,
    onSuccess: async (saved) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cash-closing-history'] }),
        queryClient.invalidateQueries({ queryKey: ['cash-closing-preview'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'executive'] }),
      ])
      navigate(`/tutup-kasir/cetak/${saved.closing_id}`)
    },
    onError: (error) => setFormError(apiError(error, id.cashClosing.saveError)),
  })

  const openingValue = /^\d+$/.test(openingCash) ? Number(openingCash) : 0
  const cashOutValue = /^\d+$/.test(cashOut) ? Number(cashOut) : 0
  const countedValue = /^\d+$/.test(countedCash) ? Number(countedCash) : null
  const expectedCash = openingValue + preview.cash_sales - cashOutValue
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError('')
    const values = [openingCash, cashOut, countedCash]
    if (values.some((value) => !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))) {
      setFormError(id.cashClosing.invalidAmount)
      return
    }
    if (expectedCash < 0) {
      setFormError(id.cashClosing.negativeTarget)
      return
    }
    const difference = Number(countedCash) - expectedCash
    if (difference !== 0 && note.trim().length === 0) {
      setFormError(id.cashClosing.noteRequiredError)
      return
    }
    if (note.trim().length > 255) {
      setFormError(id.cashClosing.noteMaxError)
      return
    }

    mutation.mutate({
      closingDate: selectedDate,
      openingCash: Number(openingCash),
      cashOut: Number(cashOut),
      countedCash: Number(countedCash),
      note: note.trim(),
    })
  }

  return (
    <section className="admin-cash-closing-page" aria-labelledby="admin-cash-closing-title">
      <nav className="cash-closing-breadcrumb" aria-label={id.navigation}><WalletCards size={19} aria-hidden="true" /><span>{id.cashClosing.breadcrumbRoot}</span><span aria-hidden="true">/</span><strong>{id.cashClosing.title}</strong></nav>
      <div className="admin-cash-closing-grid">
        <section className="admin-closing-form-card" aria-labelledby="admin-cash-closing-title">
          <header className="admin-closing-form-heading"><span><Banknote size={24} aria-hidden="true" /></span><div><h1 id="admin-cash-closing-title">{id.cashClosing.adminTitle}</h1><p>{id.cashClosing.adminSubtitle}</p></div></header>
          <label className="closing-date-picker" htmlFor="closing-date">
            <span><CalendarDays size={19} aria-hidden="true" />{id.cashClosing.dateLabel}</span>
            <select id="closing-date" value={selectedDate} onChange={(event) => onDateChange(event.target.value)}>
              {dates.map((date) => <option key={date} value={date}>{formatDateWib(`${date}T00:00:00+07:00`)}{date === today ? ` ${id.cashClosing.todaySuffix}` : ''}</option>)}
            </select>
          </label>

          <form className="closing-reconciliation-form" onSubmit={handleSubmit} noValidate>
            <CashSummary preview={preview} />

            <div className="cash-input-grid">
              <CashAmountField inputId="opening-cash" label={id.cashClosing.openingCash} hint={id.cashClosing.openingHint} value={openingCash} onChange={setOpeningCash} />
              <CashAmountField inputId="cash-out" label={id.cashClosing.cashOut} hint={id.cashClosing.cashOutHint} value={cashOut} onChange={setCashOut} />
            </div>

            <section className="expected-cash-panel" aria-labelledby="expected-cash-title">
              <div><h2 id="expected-cash-title"><Calculator size={20} aria-hidden="true" />{id.cashClosing.expectedCash}</h2><p>{id.cashClosing.liveCalculation.replace('{opening}', formatRupiah(openingValue)).replace('{sales}', formatRupiah(preview.cash_sales)).replace('{cashOut}', formatRupiah(cashOutValue))}</p></div>
              <div><strong>{formatRupiah(expectedCash)}</strong><span>{id.cashClosing.requiredAmount}</span></div>
            </section>

            <label className="actual-cash-field" htmlFor="counted-cash">
              <span><strong><Banknote size={19} aria-hidden="true" />{id.cashClosing.actualCash}</strong><small>{id.cashClosing.actualHint}</small></span>
              <span className="cash-input-shell actual-cash-input"><span>Rp</span><input id="counted-cash" type="number" min="0" step="1" inputMode="numeric" value={countedCash} onChange={(event) => setCountedCash(event.target.value)} required /></span>
            </label>

            <CashDifference target={expectedCash} counted={countedValue} />

            <label className="closing-note-field" htmlFor="closing-note">
              <span><strong>{id.cashClosing.note}</strong><small>{id.cashClosing.noteRequired}</small></span>
              <textarea id="closing-note" maxLength={255} value={note} onChange={(event) => setNote(event.target.value)} />
              <small>{id.cashClosing.noteHint}</small>
            </label>

            {formError && <p className="cash-closing-form-error" role="alert"><CircleAlert size={17} aria-hidden="true" />{formError}</p>}
            <button className="save-closing-button" type="submit" disabled={mutation.isPending || !selectedDate}>
              {mutation.isPending ? <span className="closing-spinner" aria-hidden="true" /> : <ArrowDownToLine size={19} aria-hidden="true" />}
              {mutation.isPending ? id.cashClosing.saving : id.cashClosing.save}
            </button>
            <p className="closing-print-footnote"><LockKeyhole size={13} aria-hidden="true" />{id.cashClosing.printNotice}</p>
          </form>
        </section>

        <AdminClosingHistory rows={history} />
      </div>
    </section>
  )
}

function AdminClosingHistory({ rows }: { rows: CashClosingHistoryRow[] }) {
  return (
    <section className="admin-closing-history" aria-labelledby="admin-closing-history-title">
      <header className="admin-closing-history-heading">
        <div><span className="closing-history-icon"><TrendingUp size={23} aria-hidden="true" /></span><div><h2 id="admin-closing-history-title">{id.cashClosing.historyAdmin}</h2><p>{id.cashClosing.last30}</p></div></div>
        <details className="closing-export-menu">
          <summary aria-label={id.cashClosing.csv}><ArrowDownToLine size={19} aria-hidden="true" /></summary>
          <div className="closing-export-options">
            <button type="button" onClick={() => downloadHistory(rows, ',')}><FileSpreadsheet size={15} aria-hidden="true" />{id.cashClosing.csvComma}</button>
            <button type="button" onClick={() => downloadHistory(rows, ';')}><FileSpreadsheet size={15} aria-hidden="true" />{id.cashClosing.csvSemicolon}</button>
          </div>
        </details>
      </header>
      <div className="admin-closing-table-scroll">
        <table className="cash-closing-table admin-closing-table">
          <thead><tr><th>{id.cashClosing.date}</th><th>{id.cashClosing.operator}</th><th>{id.cashClosing.target}</th><th>{id.cashClosing.counted}</th><th>{id.cashClosing.difference}</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.closing_id ?? row.closing_date}>
                <td><span className={`closing-history-dot ${row.difference === 0 ? 'is-even' : row.difference > 0 ? 'is-surplus' : 'is-short'}`} /><span className="closing-history-date">{formatDateWib(`${row.closing_date}T00:00:00+07:00`)}</span></td>
                <td>{row.username ?? id.notAvailable}</td>
                <td>{formatRupiah(row.expected_cash)}</td>
                <td><strong>{formatRupiah(row.counted_cash)}</strong></td>
                <td><div className="closing-difference-pills"><span className={`difference-pill ${row.difference === 0 ? 'is-even' : row.difference > 0 ? 'is-surplus' : 'is-short'}`}>{numberWithSign(row.difference)}{row.difference === 0 && ' (Pas)'}</span>{row.stale && <span className="closing-stale-pill"><AlertTriangle size={12} aria-hidden="true" />{id.cashClosing.stale}</span>}</div></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5}><p className="cash-closing-empty">{id.cashClosing.noHistory}</p></td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
