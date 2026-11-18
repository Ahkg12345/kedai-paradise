import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownWideNarrow, ArrowUpDown, ArrowUpNarrowWide, Banknote, CalendarDays, CheckCircle2, CircleX, CreditCard, ReceiptText, TrendingUp, Wallet, type LucideIcon } from 'lucide-react'
import { useSession } from '@/app/session-context'
import { apiError } from '@/lib/api-error'
import { currentWibDate, formatRupiah } from '@/lib/format'
import { id } from '@/lib/i18n/id'
import { ReportControls } from './ReportControls'
import { ReportPagination } from './ReportPagination'
import { ReportPrintHeader } from './ReportPrintHeader'
import { fetchAllDailyReport, fetchDailyReportPage, fetchReportSummary, REPORT_PAGE_SIZE, type DailyReportSortKey, type ReportSort } from './report-data'
import { cashShare, createCsv, downloadCsv, formatPeriodDate, reportPrintTime } from './report-utils'
import './reports.css'

const DAILY_QUERY_KEY = ['sales-report-daily'] as const
const SUMMARY_QUERY_KEY = ['sales-report-summary'] as const

function firstOfMonth(date: string) {
  return `${date.slice(0, 7)}-01`
}

function yesterdayOf(date: string) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() - 1)
  return value.toISOString().slice(0, 10)
}

function poolLabel(pool: 'restock' | 'operating' | 'profit') {
  if (pool === 'restock') return id.reporting.poolNames.restock
  if (pool === 'operating') return id.reporting.poolNames.operating
  return id.reporting.poolNames.profit
}

function dateLabel(date: string) {
  return formatPeriodDate(date)
}

function SortHeading({
  label,
  sortKey,
  sort,
  onSort,
  align = 'right',
}: {
  label: string
  sortKey: DailyReportSortKey
  sort: ReportSort<DailyReportSortKey>
  onSort: (key: DailyReportSortKey) => void
  align?: 'left' | 'right'
}) {
  const isSelected = sort.key === sortKey
  const Icon = !isSelected ? ArrowUpDown : sort.direction === 'asc' ? ArrowUpNarrowWide : ArrowDownWideNarrow
  return (
    <th scope="col" aria-sort={isSelected ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className={align === 'right' ? 'is-numeric' : ''}>
      <button type="button" className="report-sort-button" onClick={() => onSort(sortKey)}>
        {label}<Icon aria-hidden="true" />
      </button>
    </th>
  )
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone = 'green',
  muted = false,
}: {
  label: string
  value: string
  note?: React.ReactNode
  icon: LucideIcon
  tone?: 'neutral' | 'green' | 'rust' | 'red' | 'muted'
  muted?: boolean
}) {
  return (
    <article className={`report-metric-card is-${tone}${muted ? ' is-muted' : ''}`}>
      <div className="report-metric-top"><h2>{label}</h2><span className="report-metric-icon"><Icon aria-hidden="true" /></span></div>
      <p className="report-metric-value">{value}</p>
      {note && <p className="report-metric-note">{note}</p>}
    </article>
  )
}

export function ReportsPage() {
  const { user } = useSession()
  const today = currentWibDate()
  const [draftStartDate, setDraftStartDate] = useState(() => firstOfMonth(today))
  const [draftEndDate, setDraftEndDate] = useState(today)
  const [period, setPeriod] = useState(() => ({ startDate: firstOfMonth(today), endDate: today }))
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<ReportSort<DailyReportSortKey>>({ key: 'date', direction: 'desc' })
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [printTime, setPrintTime] = useState(reportPrintTime)
  const periodIsValid = Boolean(draftStartDate && draftEndDate && draftStartDate <= draftEndDate)
  const appliedPeriodIsValid = Boolean(period.startDate && period.endDate && period.startDate <= period.endDate)

  const summaryQuery = useQuery({
    queryKey: [...SUMMARY_QUERY_KEY, period.startDate, period.endDate],
    queryFn: () => fetchReportSummary(period.startDate, period.endDate),
    enabled: user?.role === 'admin' && appliedPeriodIsValid,
  })
  const dailyQuery = useQuery({
    queryKey: [...DAILY_QUERY_KEY, period.startDate, period.endDate, page, sort],
    queryFn: () => fetchDailyReportPage(period.startDate, period.endDate, page, sort),
    enabled: user?.role === 'admin' && appliedPeriodIsValid,
  })

  const summary = summaryQuery.data
  const rows = dailyQuery.data?.rows ?? []
  const exportHeaders = useMemo(() => [
    id.reporting.csvHeaders.date,
    id.reporting.csvHeaders.orders,
    id.reporting.csvHeaders.revenue,
    id.reporting.csvHeaders.cost,
    id.reporting.csvHeaders.grossProfit,
    id.reporting.csvHeaders.netProfit,
  ], [])

  const applyPeriod = () => {
    setPeriod({ startDate: draftStartDate, endDate: draftEndDate })
    setPage(1)
  }

  const updateSort = (key: DailyReportSortKey) => {
    setSort((current) => ({ key, direction: current.key === key ? (current.direction === 'asc' ? 'desc' : 'asc') : key === 'date' ? 'desc' : 'desc' }))
    setPage(1)
  }

  const exportReport = async (delimiter: ',' | ';') => {
    setIsExporting(true)
    setExportError('')
    try {
      const allRows = await fetchAllDailyReport(period.startDate, period.endDate, sort)
      const csv = createCsv([
        exportHeaders,
        ...allRows.map((row) => [dateLabel(row.report_date), row.order_count, row.revenue, row.total_cost, row.gross_profit, row.net_profit]),
      ], delimiter)
      downloadCsv(csv, `laporan-ringkasan-${period.startDate}-${period.endDate}.csv`)
    } catch (error) {
      setExportError(apiError(error, id.reporting.exportError))
    } finally {
      setIsExporting(false)
    }
  }

  const printReport = () => {
    setPrintTime(reportPrintTime())
    window.setTimeout(() => window.print(), 30)
  }

  const isLoading = summaryQuery.isPending || dailyQuery.isPending
  const hasError = summaryQuery.isError || dailyQuery.isError
  const loadError = apiError(summaryQuery.error ?? dailyQuery.error, id.reporting.loadError)
  const money = (value: number | undefined) => isLoading ? id.reporting.loading : hasError ? '—' : formatRupiah(value ?? 0)
  const count = (value: number | undefined) => isLoading ? id.reporting.loading : hasError ? '—' : String(value ?? 0)
  const cashPct = summary ? cashShare(summary.cash_total, summary.revenue) : 0
  const qrisPct = summary ? cashShare(summary.qris_total, summary.revenue) : 0
  const todayDate = currentWibDate()
  const yesterday = yesterdayOf(todayDate)
  const rangeStart = dailyQuery.data?.count ? (page - 1) * REPORT_PAGE_SIZE + 1 : 0
  const rangeEnd = Math.min(page * REPORT_PAGE_SIZE, dailyQuery.data?.count ?? 0)

  return (
    <div className="reports-page">
      <section className="report-hero" aria-labelledby="report-page-title">
        <div className="report-hero-copy">
          <span className="report-eyebrow">{id.reporting.eyebrow}</span>
          <h1 id="report-page-title">{id.reporting.title}</h1>
        </div>
        <ReportControls
          variant="summary"
          startDate={draftStartDate}
          endDate={draftEndDate}
          onStartDateChange={setDraftStartDate}
          onEndDateChange={setDraftEndDate}
          onApply={applyPeriod}
          onExport={(delimiter) => void exportReport(delimiter)}
          onPrint={printReport}
          isExporting={isExporting}
          invalidPeriod={!periodIsValid}
        />
      </section>

      {(summaryQuery.isError || dailyQuery.isError) && <p className="report-error" role="alert">{loadError}</p>}
      {exportError && <p className="report-error" role="alert">{exportError}</p>}

      <div className="report-metrics-grid">
        <MetricCard label={id.reporting.totalRevenue} value={money(summary?.revenue)} icon={Banknote} tone="neutral" />
        <MetricCard label={id.reporting.grossProfit} value={money(summary?.gross_profit)} icon={TrendingUp} tone="green" note={<>{id.reporting.grossMarginLabel} {summary ? `${summary.gross_margin_pct.toFixed(1)}%` : isLoading ? id.reporting.loading : '—'}</>} />
        <MetricCard label={id.reporting.netProfit} value={money(summary?.net_profit)} icon={Wallet} tone="rust" note={<span className="report-success-note"><CheckCircle2 aria-hidden="true" />{id.reporting.netMarginLabel} {summary ? `${summary.net_margin_pct.toFixed(1)}%` : isLoading ? id.reporting.loading : '—'}</span>} />
        <MetricCard label={id.reporting.totalExpense} value={money(summary ? summary.total_cost + summary.manual_expense : undefined)} icon={ReceiptText} tone="red" note={id.reporting.expenseNote} />
        <MetricCard label={id.reporting.netCashBalance} value={money(summary?.cash_balance)} icon={Wallet} tone="green" note={id.reporting.cashNote} />
        <MetricCard label={id.reporting.voidStatus} value={`${count(summary?.void_count)} ${id.reporting.voidOrders}`} icon={CircleX} tone="muted" muted note={<span className="report-void-amount">{money(summary?.void_total)} <span>({id.reporting.voided})</span></span>} />
      </div>

      <section className="report-operations-band" aria-label={id.reporting.operationalSummary}>
        <h2><span><TrendingUp aria-hidden="true" /></span>{id.reporting.operationalSummary}</h2>
        <div className="report-operation-pills">
          <span className="report-volume-pill">{id.reporting.volume}: <strong>{id.reporting.totalOrders} {count(summary?.order_count)}</strong></span>
          <span className="report-cash-pill"><Banknote aria-hidden="true" />{id.reporting.cash} {money(summary?.cash_total)} ({isLoading || hasError ? (isLoading ? id.reporting.loading : '—') : `${cashPct}%`})</span>
          <span className="report-qris-pill"><CreditCard aria-hidden="true" />{id.reporting.qris} {money(summary?.qris_total)} ({isLoading || hasError ? (isLoading ? id.reporting.loading : '—') : `${qrisPct}%`})</span>
        </div>
      </section>

      <section className="report-card report-pools-card" aria-labelledby="report-pools-title">
        <div className="report-section-heading">
          <h2 id="report-pools-title"><span className="report-heading-bar is-green" />{id.reporting.poolTitle}</h2>
          {summary && <span className={`report-reconcile-badge ${summary.reconciliation_matches ? 'is-match' : 'is-mismatch'}`}>
            {summary.reconciliation_matches ? <CheckCircle2 aria-hidden="true" /> : <CircleX aria-hidden="true" />}
            {summary.reconciliation_matches ? id.reporting.reconciliationMatches : id.reporting.reconciliationMismatch}
          </span>}
        </div>
        <div className="report-table-scroll" role="region" aria-label={id.reporting.poolTableRegion} tabIndex={0}>
          <table className="report-table report-pool-table">
            <thead><tr>
              <th scope="col">{id.reporting.poolColumn}</th>
              <th scope="col" className="is-numeric">{id.reporting.allocationColumn}</th>
              <th scope="col" className="is-numeric">{id.reporting.manualIncomeColumn}</th>
              <th scope="col" className="is-numeric">{id.reporting.manualExpenseColumn}</th>
              <th scope="col" className="is-numeric">{id.reporting.balanceColumn}</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td className="report-table-state" colSpan={5}>{id.reporting.loading}</td></tr> : hasError ? <tr><td className="report-table-state" colSpan={5}>{id.reporting.loadError}</td></tr> : !summary || summary.pools.length === 0 ? <tr><td className="report-table-state" colSpan={5}>{id.reporting.emptyPools}</td></tr> : <>
                {summary.pools.map((pool) => <tr key={pool.pool}>
                  <td><span className={`report-pool-name is-${pool.pool}`}><span aria-hidden="true" />{poolLabel(pool.pool)}</span></td>
                  <td className="is-numeric">{formatRupiah(pool.sales_allocation)}</td>
                  <td className="is-numeric is-positive">{formatRupiah(pool.manual_income)}</td>
                  <td className="is-numeric is-negative">{formatRupiah(pool.manual_expense)}</td>
                  <td className={`is-numeric report-pool-balance is-${pool.pool}`}>{formatRupiah(pool.balance)}</td>
                </tr>)}
                <tr className="report-total-row">
                  <th scope="row">{id.reporting.reconciliationTotal}</th>
                  <td className="is-numeric">{formatRupiah(summary.revenue)}</td>
                  <td className="is-numeric is-positive">{formatRupiah(summary.manual_income)}</td>
                  <td className="is-numeric is-negative">{formatRupiah(summary.manual_expense)}</td>
                  <td className="is-numeric report-total-balance">{formatRupiah(summary.cash_balance)}</td>
                </tr>
              </>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="report-card report-daily-card" aria-labelledby="report-daily-title">
        <div className="report-section-heading">
          <h2 id="report-daily-title"><span className="report-heading-bar is-rust" />{id.reporting.dailyTitle}</h2>
          <p className="report-sort-hint"><ArrowUpDown aria-hidden="true" />{id.reporting.sortHint}</p>
        </div>
        <div className="report-table-scroll" role="region" aria-label={id.reporting.dailyTableRegion} tabIndex={0}>
          <table className="report-table report-daily-table">
            <thead><tr>
              <SortHeading label={id.reporting.dateColumn} sortKey="date" sort={sort} onSort={updateSort} align="left" />
              <SortHeading label={id.reporting.ordersColumn} sortKey="orders" sort={sort} onSort={updateSort} />
              <SortHeading label={id.reporting.revenueColumn} sortKey="revenue" sort={sort} onSort={updateSort} />
              <SortHeading label={id.reporting.costColumn} sortKey="cost" sort={sort} onSort={updateSort} />
              <SortHeading label={id.reporting.grossProfitColumn} sortKey="gross_profit" sort={sort} onSort={updateSort} />
              <SortHeading label={id.reporting.netProfitColumn} sortKey="net_profit" sort={sort} onSort={updateSort} />
            </tr></thead>
            <tbody>
              {dailyQuery.isPending ? <tr><td className="report-table-state" colSpan={6}>{id.reporting.loading}</td></tr> : dailyQuery.isError ? <tr><td className="report-table-state" colSpan={6}>{id.reporting.loadError}</td></tr> : rows.length === 0 ? <tr><td className="report-table-state" colSpan={6}>{id.reporting.emptyDaily}</td></tr> : rows.map((row) => <tr key={row.report_date}>
                <td className="report-date-cell"><CalendarDays aria-hidden="true" /><strong>{dateLabel(row.report_date)}</strong>{row.report_date === todayDate ? <span className="report-day-chip is-today">{id.reporting.today}</span> : row.report_date === yesterday ? <span className="report-day-chip">{id.reporting.yesterday}</span> : null}</td>
                <td className="is-numeric"><span className="report-order-pill">{row.order_count}</span></td>
                <td className="is-numeric">{formatRupiah(row.revenue)}</td>
                <td className="is-numeric report-cost-value">{formatRupiah(row.total_cost)}</td>
                <td className="is-numeric report-gross-value">{formatRupiah(row.gross_profit)}</td>
                <td className="is-numeric report-net-value">{formatRupiah(row.net_profit)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <ReportPagination page={page} count={dailyQuery.data?.count ?? 0} onPageChange={setPage} itemLabel="days" />
        <p className="report-daily-footnote">{id.reporting.dailyFooter.replace('{from}', String(rangeStart)).replace('{to}', String(rangeEnd)).replace('{total}', String(dailyQuery.data?.count ?? 0))}</p>
      </section>

      <ReportPrintHeader
        businessName={summary?.business_name ?? id.reporting.printBusiness}
        title={id.reporting.title}
        startDate={period.startDate}
        endDate={period.endDate}
        printedBy={user?.username ?? ''}
        printedAt={printTime}
      />
    </div>
  )
}
