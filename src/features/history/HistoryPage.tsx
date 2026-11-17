import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, FileSpreadsheet, LockKeyhole, Printer, QrCode, ReceiptText, SlidersHorizontal, WalletCards } from 'lucide-react'
import { useSession } from '@/app/session-context'
import { formatDateTimeWib, formatRupiah } from '@/lib/format'
import { formatInTimeZone } from 'date-fns-tz'
import { supabase } from '@/lib/supabase/client'
import { apiError } from '@/lib/api-error'
import { id } from '@/lib/i18n/id'
import { checkoutMetaQueryKey } from '@/features/pos/use-checkout-meta'
import type { UserRole } from '@/types/session'
import {
  fetchAllHistory,
  fetchHistoryDetails,
  fetchHistoryPage,
  fetchHistoryRow,
  fetchHistorySummary,
  initialHistoryFilters,
  type HistoryDetailItem,
  type HistoryFilters,
  type HistoryRow,
  type HistorySort,
  type HistorySortField,
} from './history-data'
import { VoidOrderDialog } from './VoidOrderDialog'
import './history.css'

const HISTORY_PAGE_SIZE = 50
const historyQueryKey = ['transaction-history'] as const
const summaryQueryKey = ['history-summary'] as const

function formatTableLabel(tableNo: string) {
  return tableNo === 'TA' ? id.pos.takeAwayAbbreviation : id.pos.tableNumber.replace('{number}', String(Number(tableNo)).padStart(2, '0'))
}

function formatMethod(method: HistoryRow['method']) {
  return method === 'cash' ? id.history.cash : id.history.qris
}

function formatStatus(status: HistoryRow['status']) {
  if (status === 'void') return id.history.void
  if (status === 'completed') return id.history.completed
  return id.history.processing
}

function formatDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return id.notAvailable
  const safe = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

function formatTime(value: string | null) {
  if (!value) return id.notAvailable
  const formatted = formatDateTimeWib(value)
  return formatted.endsWith(` ${id.wib}`) ? formatted.slice(0, -(id.wib.length + 1)) : formatted
}

function safeCsvCell(value: unknown) {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

function downloadCsv(rows: HistoryRow[], role: UserRole, separator: ',' | ';') {
  const headers = role === 'admin'
    ? [id.history.csvHeaders.order, id.history.csvHeaders.date, id.history.csvHeaders.table, id.history.csvHeaders.method, id.history.csvHeaders.total, id.history.csvHeaders.status, id.history.csvHeaders.duration, id.history.csvHeaders.cost, id.history.csvHeaders.profit, id.history.csvHeaders.cashier]
    : [id.history.csvHeaders.order, id.history.csvHeaders.date, id.history.csvHeaders.table, id.history.csvHeaders.method, id.history.csvHeaders.total, id.history.csvHeaders.status, id.history.csvHeaders.duration, id.history.csvHeaders.cashier]
  const body = rows.map((row) => {
    const values: unknown[] = [row.order_no, formatDateTimeWib(row.date), formatTableLabel(row.table_no), formatMethod(row.method), row.total, formatStatus(row.status), row.duration_seconds ?? '']
    if (role === 'admin') values.push(row.total_cost ?? '', row.gross_profit ?? '')
    values.push(row.username)
    return values.map((value) => safeCsvCell(value)).join(separator)
  })
  const csv = `\uFEFF${[headers.map((value) => safeCsvCell(value)).join(separator), ...body].join('\r\n')}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `riwayat-transaksi-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function HistoryFiltersPanel({
  role,
  draft,
  setDraft,
  onSubmit,
  onExport,
  onPrint,
}: {
  role: UserRole
  draft: HistoryFilters
  setDraft: (value: HistoryFilters) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onExport: (separator: ',' | ';') => void
  onPrint: () => void
}) {
  return (
    <form className="history-filter-panel" onSubmit={onSubmit}>
      <div className="history-filter-fields">
        <label className="history-filter-group history-period-filter">
          <span className="history-filter-label">{id.history.period}{role === 'cashier' && <LockKeyhole size={13} aria-hidden="true" />}</span>
          <span className="history-date-range">
            <span className="history-date-input"><CalendarDays size={18} aria-hidden="true" /><input type="date" aria-label={id.history.dateStartLabel} value={draft.startDate} readOnly={role === 'cashier'} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} /></span>
            <span className="history-date-separator">{id.history.dateRangeSeparator}</span>
            <span className="history-date-input"><CalendarDays size={18} aria-hidden="true" /><input type="date" aria-label={id.history.dateEndLabel} value={draft.endDate} readOnly={role === 'cashier'} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} /></span>
          </span>
          {role === 'cashier' && <span className="history-filter-help">{id.history.lockedToday}</span>}
        </label>
        <label className="history-filter-group">
          <span className="history-filter-label">{role === 'cashier' ? id.history.cashierMethod : id.history.paymentMethod}</span>
          <select value={draft.method} onChange={(event) => setDraft({ ...draft, method: event.target.value as HistoryFilters['method'] })}>
            <option value="all">{id.history.all}</option>
            <option value="cash">{id.history.cash}</option>
            <option value="qris">{id.history.qris}</option>
          </select>
        </label>
        <label className="history-filter-group">
          <span className="history-filter-label">{role === 'cashier' ? id.history.cashierStatus : id.history.transactionStatus}</span>
          <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as HistoryFilters['status'] })}>
            <option value="all">{id.history.all}</option>
            <option value="processing">{id.history.processing}</option>
            <option value="completed">{id.history.completed}</option>
            <option value="void">{id.history.void}</option>
          </select>
        </label>
        <button className="history-filter-button" type="submit"><SlidersHorizontal size={17} aria-hidden="true" />{id.history.filter}</button>
      </div>
      <div className="history-list-actions">
        <details className="history-export-menu">
          <summary><FileSpreadsheet size={17} aria-hidden="true" />{id.history.export}<ChevronDown size={15} aria-hidden="true" /></summary>
          <div className="history-export-options">
            <button type="button" onClick={() => onExport(',')}>{id.history.exportComma}</button>
            <button type="button" onClick={() => onExport(';')}>{id.history.exportSemicolon}</button>
          </div>
        </details>
        <button type="button" className="history-print-button" onClick={onPrint}><Printer size={18} aria-hidden="true" />{id.history.printPdf}</button>
      </div>
    </form>
  )
}

function SortButton({
  label,
  field,
  sort,
  onSort,
}: {
  label: string
  field: HistorySortField
  sort: HistorySort
  onSort: (field: HistorySortField) => void
}) {
  const selected = sort.field === field
  return (
    <button type="button" className="history-sort-button" onClick={() => onSort(field)} aria-label={`${label}, ${selected ? (sort.ascending ? id.history.sortAscending : id.history.sortDescending) : id.history.sortBy}`}>
      {label}{selected ? (sort.ascending ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />) : <ArrowDown size={12} aria-hidden="true" className="history-sort-muted" />}
    </button>
  )
}

function DetailItems({ items }: { items: HistoryDetailItem[] }) {
  return (
    <div className="history-detail-items">
      {items.map((item) => (
        <span className="history-detail-chip" key={item.order_id}>
          <strong>{item.quantity}x {item.name}</strong>
          {item.modifiers.length > 0 && <em> [{item.modifiers.join(', ')}]</em>}
          {item.note && <small>{id.pos.notePrefix} {item.note}</small>}
        </span>
      ))}
    </div>
  )
}

function TransactionRow({
  row,
  role,
  expanded,
  onToggle,
  onVoid,
}: {
  row: HistoryRow
  role: UserRole
  expanded: boolean
  onToggle: () => void
  onVoid: () => void
}) {
  const detailsQuery = useQuery({
    queryKey: ['history-details', row.transaction_id],
    queryFn: () => fetchHistoryDetails(row.transaction_id),
    enabled: role === 'admin' && expanded,
    staleTime: 30_000,
  })
  const isAdmin = role === 'admin'
  const isVoid = row.status === 'void'

  return (
    <>
      <tr className={`history-data-row${isVoid ? ' is-void' : ''}${expanded ? ' is-expanded' : ''}`}>
        <td>{isAdmin ? <button type="button" className="history-order-toggle" onClick={onToggle} aria-expanded={expanded} aria-label={(expanded ? id.history.closeDetails : id.history.openDetails).replace('{order}', String(row.order_no))}>{String(row.order_no).padStart(3, '0')}</button> : <span className="history-order-number">{String(row.order_no).padStart(3, '0')}</span>}</td>
        <td><time>{formatDateTimeWib(row.date)}{isVoid && <small className="history-void-date">{id.history.void}</small>}</time></td>
        <td><span className={`history-table-chip${row.table_no === 'TA' ? ' is-takeaway' : ''}`}>{formatTableLabel(row.table_no)}</span></td>
        <td><span className={`history-method-chip is-${row.method}`}>{row.method === 'cash' ? <WalletCards size={14} aria-hidden="true" /> : <QrCode size={14} aria-hidden="true" />}{formatMethod(row.method)}</span></td>
        <td><strong className="history-total">{formatRupiah(row.total)}</strong></td>
        <td><span className={`history-status-chip is-${row.status}`}><span aria-hidden="true" />{formatStatus(row.status)}</span></td>
        <td>{formatDuration(row.duration_seconds)}</td>
        {isAdmin && <>
          <td>{isVoid ? id.notAvailable : formatRupiah(row.total_cost ?? 0)}</td>
          <td>{isVoid ? id.notAvailable : formatRupiah(row.gross_profit ?? 0)}</td>
          <td><span className={`history-cashier-chip is-${row.user_role ?? 'cashier'}`}>{row.username}</span></td>
        </>}
        {!isAdmin && <td>{row.username}</td>}
        <td className="history-actions-cell">
          <Link className="history-receipt-action" to={`/struk/${row.transaction_id}?reprint=1`} target="_blank" rel="noreferrer" aria-label={`${id.history.receipt} ${row.order_no}`}><ReceiptText size={16} aria-hidden="true" />{id.history.receipt}</Link>
          {isAdmin && !isVoid && <button className="history-void-action" type="button" onClick={onVoid}>{id.history.voidAction}</button>}
        </td>
      </tr>
      {isAdmin && expanded && (
        <tr className={`history-detail-row${isVoid ? ' is-void' : ''}`}>
          <td colSpan={11}>
            {isVoid ? (
              <div className="history-cancellation-strip">
                <strong>{id.history.cancellationReason}</strong>
                <span>{row.void_reason || id.notAvailable}</span>
                {row.voided_by_username && row.voided_at && <small>{id.history.voidedBy.replace('{username}', row.voided_by_username).replace('{time}', formatTime(row.voided_at))}</small>}
              </div>
            ) : (
              <div className="history-items-strip">
                <strong>{id.history.details}</strong>
                {detailsQuery.isPending ? <span>{id.history.loading}</span> : detailsQuery.isError ? <span role="alert">{apiError(detailsQuery.error)}</span> : <DetailItems items={detailsQuery.data?.items ?? []} />}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

export function HistoryPage() {
  const { user } = useSession()
  const queryClient = useQueryClient()
  const role = user?.role ?? 'cashier'
  const isAdmin = role === 'admin'
  const [searchParams] = useSearchParams()
  const focusedTransactionId = Number(searchParams.get('transaction'))
  const [draftFilters, setDraftFilters] = useState<HistoryFilters>(() => initialHistoryFilters(role))
  const [filters, setFilters] = useState<HistoryFilters>(() => initialHistoryFilters(role))
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<HistorySort>({ field: 'date', ascending: false })
  const [expandedId, setExpandedId] = useState<number | null>(() => focusedTransactionId > 0 ? focusedTransactionId : null)
  const [voidTarget, setVoidTarget] = useState<HistoryRow | null>(null)
  const [notice, setNotice] = useState('')
  const historyQuery = useQuery({
    queryKey: [...historyQueryKey, role, filters, sort, page],
    queryFn: () => fetchHistoryPage({ role, filters, sort, page, pageSize: HISTORY_PAGE_SIZE }),
    enabled: Boolean(user),
    placeholderData: (previous) => previous,
  })
  const focusedRowQuery = useQuery({
    queryKey: ['history-focused-row', focusedTransactionId],
    queryFn: () => fetchHistoryRow(focusedTransactionId),
    enabled: isAdmin && Number.isSafeInteger(focusedTransactionId) && focusedTransactionId > 0,
    staleTime: 30_000,
  })
  const summaryQuery = useQuery({
    queryKey: [...summaryQueryKey, filters],
    queryFn: () => fetchHistorySummary(filters),
    enabled: isAdmin,
    staleTime: 30_000,
  })
  const rows = historyQuery.data?.rows ?? []
  const totalCount = historyQuery.data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / HISTORY_PAGE_SIZE))
  const focusedRow = focusedRowQuery.data ?? null
  const visibleRows = focusedRow && !rows.some((row) => row.transaction_id === focusedRow.transaction_id) ? [focusedRow, ...rows] : rows
  const summary = summaryQuery.data
  const pageError = historyQuery.isError ? apiError(historyQuery.error, id.history.loadError) : ''
  const datePeriod = `${formatInTimeZone(new Date(`${filters.startDate}T00:00:00+07:00`), 'Asia/Jakarta', 'dd/MM/yyyy')} ${id.history.printDateRangeSeparator} ${formatInTimeZone(new Date(`${filters.endDate}T00:00:00+07:00`), 'Asia/Jakarta', 'dd/MM/yyyy')}`
  const printSettingsQuery = useQuery({
    queryKey: ['history-print-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('cashier_settings').select('business_name').maybeSingle()
      if (error) throw error
      return data?.business_name || id.history.businessName
    },
    enabled: Boolean(user),
    staleTime: 60_000,
  })

  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isAdmin && (!draftFilters.startDate || !draftFilters.endDate || draftFilters.startDate > draftFilters.endDate)) {
      setNotice(id.history.invalidPeriod)
      return
    }
    setNotice('')
    setFilters({ ...draftFilters })
    setPage(1)
    setExpandedId(null)
  }

  const updateSort = (field: HistorySortField) => {
    setSort((current) => ({ field, ascending: current.field === field ? !current.ascending : field === 'order_no' || field === 'date' ? false : true }))
    setPage(1)
  }

  const handleExport = async (separator: ',' | ';') => {
    if (!user) return
    try {
      const allRows = await fetchAllHistory(role, filters, sort)
      downloadCsv(allRows, role, separator)
    } catch (error) {
      setNotice(apiError(error, id.history.loadError))
    }
  }

  const handlePrint = () => window.print()

  const handleVoidSuccess = async () => {
    setVoidTarget(null)
    setNotice(id.history.voidSuccess)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: historyQueryKey }),
      queryClient.invalidateQueries({ queryKey: summaryQueryKey }),
      queryClient.invalidateQueries({ queryKey: ['order-queue'] }),
      queryClient.invalidateQueries({ queryKey: checkoutMetaQueryKey }),
    ])
  }

  useEffect(() => {
    if (focusedRow && focusedTransactionId > 0) setExpandedId(focusedTransactionId)
  }, [focusedRow, focusedTransactionId])

  const tableColumns = isAdmin ? 11 : 9

  return (
    <div className={`history-page${isAdmin ? ' is-admin' : ' is-cashier'}`}>
      <header className="history-page-heading">
        {isAdmin && <p className="history-eyebrow"><span aria-hidden="true" />{id.history.eyebrow}</p>}
        <h1>{id.history.title}</h1>
      </header>

      <HistoryFiltersPanel
        role={role}
        draft={draftFilters}
        setDraft={setDraftFilters}
        onSubmit={applyFilters}
        onExport={(separator) => void handleExport(separator)}
        onPrint={handlePrint}
      />

      {notice && <p className="history-notice" role="status">{notice}</p>}
      {pageError && <p className="history-error" role="alert">{pageError}</p>}
      <div className="history-print-header">
        <strong>{printSettingsQuery.data || id.history.businessName}</strong>
        <h2>{id.history.printTitle}</h2>
        <p>{id.history.printPeriod.replace('{start}', datePeriod.split(` ${id.history.printDateRangeSeparator} `)[0]).replace('{end}', datePeriod.split(` ${id.history.printDateRangeSeparator} `)[1])}</p>
        <p>{id.history.printBy.replace('{name}', user?.name ?? '')} • {formatDateTimeWib(new Date())}</p>
      </div>

      <section className="history-table-panel" aria-label={id.history.title} aria-busy={historyQuery.isPending}>
        <div className="history-table-scroll">
          <table className="history-table">
            <thead>
              <tr>
                <th><SortButton label={id.history.columns.order} field="order_no" sort={sort} onSort={updateSort} /></th>
                <th><SortButton label={id.history.columns.date} field="date" sort={sort} onSort={updateSort} /></th>
                <th><SortButton label={id.history.columns.table} field="table_no" sort={sort} onSort={updateSort} /></th>
                <th><SortButton label={id.history.columns.method} field="method" sort={sort} onSort={updateSort} /></th>
                <th><SortButton label={id.history.columns.total} field="total" sort={sort} onSort={updateSort} /></th>
                <th><SortButton label={id.history.columns.status} field="status" sort={sort} onSort={updateSort} /></th>
                <th><SortButton label={id.history.columns.duration} field="duration_seconds" sort={sort} onSort={updateSort} /></th>
                {isAdmin && <>
                  <th><SortButton label={id.history.columns.cost} field="total_cost" sort={sort} onSort={updateSort} /></th>
                  <th><SortButton label={id.history.columns.profit} field="gross_profit" sort={sort} onSort={updateSort} /></th>
                  <th><SortButton label={id.history.columns.cashier} field="username" sort={sort} onSort={updateSort} /></th>
                </>}
                {!isAdmin && <th>{id.history.columns.cashier}</th>}
                <th>{id.history.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <TransactionRow
                  key={row.transaction_id}
                  row={row}
                  role={role}
                  expanded={expandedId === row.transaction_id}
                  onToggle={() => setExpandedId((current) => current === row.transaction_id ? null : row.transaction_id)}
                  onVoid={() => setVoidTarget(row)}
                />
              ))}
              {!historyQuery.isPending && rows.length === 0 && (
                <tr><td colSpan={tableColumns}><p className="history-empty">{id.history.noResults}</p></td></tr>
              )}
              {historyQuery.isPending && rows.length === 0 && (
                <tr><td colSpan={tableColumns}><p className="history-empty" role="status">{id.history.loading}</p></td></tr>
              )}
            </tbody>
            {isAdmin && summary && <tfoot>
              <tr>
                <td colSpan={tableColumns}>
                  <div className="history-summary-bar">
                    <div className="history-summary-title"><strong>{id.history.summary}</strong><span className="history-active-count">{id.history.activeCount.replace('{count}', String(summary.active_count))}</span><em>{id.history.voidIgnored.replace('{count}', String(summary.void_count))}</em></div>
                    <div className="history-summary-metrics">
                      <span>{id.history.revenue} <strong>{formatRupiah(summary.revenue)}</strong></span>
                      <i aria-hidden="true" />
                      <span>{id.history.totalCost} <strong>{formatRupiah(summary.total_cost)}</strong></span>
                      <i aria-hidden="true" />
                      <span>{id.history.grossProfit} <strong>{formatRupiah(summary.gross_profit)}</strong></span>
                    </div>
                  </div>
                </td>
              </tr>
            </tfoot>}
          </table>
        </div>

        <footer className="history-table-footer">
          <div className="history-result-count"><span>{id.history.showing.replace('{from}', String(totalCount === 0 ? 0 : (page - 1) * HISTORY_PAGE_SIZE + 1)).replace('{to}', String(Math.min(page * HISTORY_PAGE_SIZE, totalCount))).replace('{total}', String(totalCount))}</span><span aria-hidden="true" className="history-footer-dot" /><strong>{id.history.rowsPerPage}</strong></div>
          <nav className="history-pagination" aria-label={id.history.paginationLabel}>
            <button type="button" aria-label={id.history.previous} onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}><ChevronLeft size={19} aria-hidden="true" /></button>
            <span aria-current="page">{id.history.page.replace('{page}', String(page))}</span>
            <button type="button" aria-label={id.history.next} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}><ChevronRight size={19} aria-hidden="true" /></button>
          </nav>
        </footer>
      </section>

      {voidTarget && <VoidOrderDialog row={voidTarget} onClose={() => setVoidTarget(null)} onSuccess={() => void handleVoidSuccess()} />}
      <span className="history-print-period" aria-hidden="true">{datePeriod}</span>
    </div>
  )
}
