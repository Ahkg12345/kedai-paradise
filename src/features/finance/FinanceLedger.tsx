import { useState } from 'react'
import { formatInTimeZone } from 'date-fns-tz'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Download, Pencil, Printer, Trash2 } from 'lucide-react'
import { formatDateWib, formatRupiah } from '@/lib/format'
import { id } from '@/lib/i18n/id'
import type { FinanceFilters, FinancePageResult, FinanceRecord, FinancePool, FinanceType } from './finance-data'
import { FINANCE_PAGE_SIZE } from './finance-data'

function poolLabel(pool: FinancePool, short = false) {
  if (pool === 'restock') return short ? id.finance.poolShort.restock : id.finance.pools.restock
  if (pool === 'operating') return id.finance.pools.operating
  return id.finance.pools.profit
}

function displayUsername(username: string) {
  return username.length ? `${username[0].toUpperCase()}${username.slice(1)}` : username
}

function FinanceTypeChip({ type }: { type: FinanceType }) {
  return (
    <span className={`finance-type-chip is-${type}`}>
      {type === 'expense' ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />}
      {type === 'expense' ? id.finance.expense : id.finance.income}
    </span>
  )
}

export function FinanceLedger({
  filters,
  onFilterChange,
  page,
  onPageChange,
  data,
  isLoading,
  error,
  isExporting,
  onEdit,
  onDelete,
  onExport,
  onPrint,
}: {
  filters: FinanceFilters
  onFilterChange: <K extends keyof FinanceFilters>(key: K, value: FinanceFilters[K]) => void
  page: number
  onPageChange: (page: number) => void
  data?: FinancePageResult
  isLoading: boolean
  error: string
  isExporting: boolean
  onEdit: (record: FinanceRecord) => void
  onDelete: (record: FinanceRecord) => void
  onExport: (delimiter: ',' | ';') => void
  onPrint: () => void
}) {
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const total = data?.count ?? 0
  const pageCount = Math.max(1, Math.ceil(total / FINANCE_PAGE_SIZE))
  const rows = data?.rows ?? []
  const rangeStart = total ? (page - 1) * FINANCE_PAGE_SIZE + 1 : 0
  const rangeEnd = Math.min(page * FINANCE_PAGE_SIZE, total)
  const periodIsValid = filters.startDate <= filters.endDate

  return (
    <section className="finance-card finance-ledger-card" aria-labelledby="finance-ledger-title">
      <div className="finance-ledger-toolbar">
        <div className="finance-ledger-heading">
          <h2 id="finance-ledger-title">{id.finance.ledgerTitle}</h2>
          <p>{id.finance.ledgerSubtitle}</p>
        </div>

        <div className="finance-filter-actions" role="group" aria-label={id.finance.filtersLabel}>
          <div className="finance-period-filter">
            <label className="sr-only" htmlFor="finance-start-date">{id.finance.startDateLabel}</label>
            <input id="finance-start-date" type="date" value={filters.startDate} onChange={(event) => onFilterChange('startDate', event.target.value)} />
            <span>{id.finance.dateRangeSeparator}</span>
            <label className="sr-only" htmlFor="finance-end-date">{id.finance.endDateLabel}</label>
            <input id="finance-end-date" type="date" value={filters.endDate} onChange={(event) => onFilterChange('endDate', event.target.value)} />
          </div>

          <label className="sr-only" htmlFor="finance-type-filter">{id.finance.typeFilterLabel}</label>
          <select id="finance-type-filter" className="finance-filter-select" value={filters.type} onChange={(event) => onFilterChange('type', event.target.value as FinanceFilters['type'])}>
            <option value="all">{id.finance.allTypes}</option>
            <option value="expense">{id.finance.expense}</option>
            <option value="income">{id.finance.income}</option>
          </select>

          <label className="sr-only" htmlFor="finance-pool-filter">{id.finance.poolFilterLabel}</label>
          <select id="finance-pool-filter" className="finance-filter-select" value={filters.pool} onChange={(event) => onFilterChange('pool', event.target.value as FinanceFilters['pool'])}>
            <option value="all">{id.finance.allPools}</option>
            <option value="restock">{id.finance.poolShort.restock}</option>
            <option value="operating">{id.finance.pools.operating}</option>
            <option value="profit">{id.finance.pools.profit}</option>
          </select>

          <div className="finance-export-wrap">
            <button
              className="finance-export-button"
              type="button"
              aria-expanded={exportMenuOpen}
              aria-haspopup="menu"
              disabled={isExporting || !periodIsValid}
              onClick={() => setExportMenuOpen((open) => !open)}
            ><Download aria-hidden="true" />{isExporting ? id.finance.exporting : id.finance.export}<span aria-hidden="true">⌄</span></button>
            {exportMenuOpen && <div className="finance-export-menu" role="menu" aria-label={id.finance.exportOptions}>
              <button type="button" role="menuitem" onClick={() => { setExportMenuOpen(false); onExport(',') }}>{id.finance.exportComma}</button>
              <button type="button" role="menuitem" onClick={() => { setExportMenuOpen(false); onExport(';') }}>{id.finance.exportSemicolon}</button>
            </div>}
          </div>
          <button className="finance-print-button" type="button" onClick={onPrint} disabled={!periodIsValid}><Printer aria-hidden="true" />{id.finance.printPdf}</button>
        </div>
      </div>

      {!periodIsValid && <p className="finance-range-error" role="alert">{id.finance.invalidPeriod}</p>}
      {error && <p className="finance-load-error" role="alert">{error}</p>}

      <div className="finance-table-scroll" role="region" aria-label={id.finance.tableRegion} tabIndex={0}>
        <table className="finance-table">
          <thead><tr>
            <th scope="col">{id.finance.columns.date}</th>
            <th scope="col">{id.finance.columns.type}</th>
            <th scope="col">{id.finance.columns.category}</th>
            <th scope="col">{id.finance.columns.pool}</th>
            <th scope="col" className="is-numeric">{id.finance.columns.amount}</th>
            <th scope="col">{id.finance.columns.user}</th>
            <th scope="col">{id.finance.columns.actions}</th>
          </tr></thead>
          <tbody>
            {isLoading ? <tr><td className="finance-table-state" colSpan={7}>{id.finance.loading}</td></tr> : error ? <tr><td className="finance-table-state" colSpan={7}>{id.finance.loadError}</td></tr> : rows.length === 0 ? <tr><td className="finance-table-state" colSpan={7}>{id.finance.empty}</td></tr> : rows.map((record) => {
              const username = displayUsername(record.username)
              return <tr key={record.finance_id}>
                <td className="finance-date-cell"><strong>{formatDateWib(record.date)}</strong><small>{formatInTimeZone(new Date(record.date), 'Asia/Jakarta', 'HH:mm')} WIB</small></td>
                <td><FinanceTypeChip type={record.type} /></td>
                <td className="finance-category-cell"><strong>{record.category}</strong>{record.description && <small>{record.description}</small>}</td>
                <td><span className={`finance-pool-chip is-${record.pool}`}>{poolLabel(record.pool, true)}</span></td>
                <td className={`finance-amount-cell is-${record.type}`}>{record.type === 'expense' ? '−' : '+'} {formatRupiah(record.amount)}</td>
                <td><span className={`finance-user-avatar ${record.username.toLowerCase() === 'fitri' ? 'is-warm' : ''}`} aria-hidden="true">{username.slice(0, 1)}</span><span className="finance-username">{username}</span></td>
                <td><div className="finance-row-actions">
                  <button type="button" className="finance-row-edit" aria-label={`${id.finance.edit} ${record.category}`} onClick={() => onEdit(record)}><Pencil aria-hidden="true" />{id.finance.edit}</button>
                  <button type="button" className="finance-row-delete" aria-label={`${id.finance.delete} ${record.category}`} onClick={() => onDelete(record)}><Trash2 aria-hidden="true" />{id.finance.delete}</button>
                </div></td>
              </tr>
            })}
          </tbody>
        </table>
      </div>

      <footer className="finance-ledger-footer">
        <div className="finance-totals" aria-label={id.finance.summaryLabel}>
          <span className="is-expense">{formatRupiah(data?.total_expense ?? 0)}</span>
          <span className="is-income">{formatRupiah(data?.total_income ?? 0)}</span>
          <span className={((data?.net ?? 0) < 0) ? 'is-expense' : 'is-income'}>{formatRupiah(data?.net ?? 0)}</span>
        </div>
        <div className="finance-pagination">
          <span>{id.finance.showing.replace('{from}', String(rangeStart)).replace('{to}', String(rangeEnd)).replace('{total}', String(total))}</span>
          <button type="button" aria-label={id.finance.previous} disabled={page <= 1 || !periodIsValid} onClick={() => onPageChange(page - 1)}><ArrowLeft aria-hidden="true" />{id.finance.previousShort}</button>
          <span className="finance-page-number" aria-current="page">{page}</span>
          <button type="button" aria-label={id.finance.next} disabled={page >= pageCount || !periodIsValid} onClick={() => onPageChange(page + 1)}>{id.finance.nextShort}<ArrowRight aria-hidden="true" /></button>
        </div>
      </footer>
    </section>
  )
}
