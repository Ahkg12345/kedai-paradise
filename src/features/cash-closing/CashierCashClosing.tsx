import { CalendarDays, Eye, Info } from 'lucide-react'
import { formatDateWib, formatRupiah } from '@/lib/format'
import { id } from '@/lib/i18n/id'
import type { CashClosingHistoryRow } from './cash-closing-data'

type CashierCashClosingProps = {
  history: CashClosingHistoryRow[]
}

function differenceText(difference: number) {
  const amount = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.abs(difference))
  if (difference === 0) return '0 (Pas)'
  return `${difference > 0 ? '+' : '-'}${amount}`
}

export function CashierCashClosing({ history }: CashierCashClosingProps) {
  return (
    <section className="cashier-closing-page" aria-labelledby="cash-closing-title">
      <header className="cashier-closing-heading">
        <p>{id.cashClosing.cashierEyebrow}</p>
        <h1 id="cash-closing-title">{id.cashClosing.title}</h1>
        <span>{id.cashClosing.subtitle}</span>
      </header>

      <aside className="cashier-closing-access" role="note">
        <span><Info size={22} aria-hidden="true" /></span>
        <div><strong>{id.cashClosing.accessLimited}</strong><p>{id.cashClosing.accessHint}</p></div>
      </aside>

      <section className="cashier-closing-history" aria-labelledby="cashier-closing-history-title">
        <header className="cashier-closing-history-heading">
          <h2 id="cashier-closing-history-title"><CalendarDays size={20} aria-hidden="true" />{id.cashClosing.historyTitle}</h2>
          <span><Eye size={17} aria-hidden="true" />{id.cashClosing.readOnly}</span>
        </header>
        <div className="cashier-closing-table-scroll">
          <table className="cash-closing-table cashier-closing-table">
            <thead><tr><th>{id.cashClosing.date}</th><th>{id.cashClosing.target}</th><th>{id.cashClosing.counted}</th><th>{id.cashClosing.difference}</th></tr></thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.closing_date}>
                  <td><span className="closing-history-date"><CalendarDays size={17} aria-hidden="true" />{formatDateWib(`${row.closing_date}T00:00:00+07:00`)}</span></td>
                  <td>{formatRupiah(row.expected_cash)}</td>
                  <td>{formatRupiah(row.counted_cash)}</td>
                  <td><div className="closing-difference-pills"><span className={`difference-pill ${row.difference === 0 ? 'is-even' : row.difference > 0 ? 'is-surplus' : 'is-short'}`}>{differenceText(row.difference)}</span>{row.stale && <span className="closing-stale-pill">{id.cashClosing.stale}</span>}</div></td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan={4}><p className="cash-closing-empty">{id.cashClosing.noHistory}</p></td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="cashier-closing-history-footer">{id.cashClosing.historyFooter.replace('{count}', String(history.length))}</footer>
      </section>
    </section>
  )
}
