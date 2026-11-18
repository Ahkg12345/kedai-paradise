import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownWideNarrow, ArrowUpDown, ArrowUpNarrowWide, BarChart3, Coffee, ShoppingBag, TrendingUp, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import { useSession } from '@/app/session-context'
import { apiError } from '@/lib/api-error'
import { currentWibDate, formatRupiah } from '@/lib/format'
import { id } from '@/lib/i18n/id'
import { ReportControls } from '@/features/reports/ReportControls'
import { ReportPagination } from '@/features/reports/ReportPagination'
import { ReportPrintHeader } from '@/features/reports/ReportPrintHeader'
import { fetchAllMenuPerformance, fetchMenuPerformancePage, fetchReportSummary, REPORT_PAGE_SIZE, type MenuPerformanceSortKey, type ReportSort } from '@/features/reports/report-data'
import { createCsv, downloadCsv, reportPrintTime } from '@/features/reports/report-utils'
import '@/features/reports/reports.css'

const MENU_PERFORMANCE_QUERY_KEY = ['menu-performance-report'] as const
const SUMMARY_QUERY_KEY = ['sales-report-summary'] as const

function firstOfMonth(date: string) {
  return `${date.slice(0, 7)}-01`
}

function SortHeading({
  label,
  sortKey,
  sort,
  onSort,
  align = 'right',
}: {
  label: string
  sortKey: MenuPerformanceSortKey
  sort: ReportSort<MenuPerformanceSortKey>
  onSort: (key: MenuPerformanceSortKey) => void
  align?: 'left' | 'right'
}) {
  const isSelected = sort.key === sortKey
  const Icon = !isSelected ? ArrowUpDown : sort.direction === 'asc' ? ArrowUpNarrowWide : ArrowDownWideNarrow
  return (
    <th scope="col" aria-sort={isSelected ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className={align === 'right' ? 'is-numeric' : ''}>
      <button type="button" className="report-sort-button" onClick={() => onSort(sortKey)}>{label}<Icon aria-hidden="true" /></button>
    </th>
  )
}

function CategoryIcon({ category }: { category: string }) {
  const normalized = category.toLocaleLowerCase('id-ID')
  const Icon: LucideIcon = normalized.includes('minuman') ? Coffee : normalized.includes('snack') ? ShoppingBag : UtensilsCrossed
  return <span className="menu-report-category-icon"><Icon aria-hidden="true" /></span>
}

export function MenuPerformancePage() {
  const { user } = useSession()
  const today = currentWibDate()
  const [draftStartDate, setDraftStartDate] = useState(() => firstOfMonth(today))
  const [draftEndDate, setDraftEndDate] = useState(today)
  const [period, setPeriod] = useState(() => ({ startDate: firstOfMonth(today), endDate: today }))
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<ReportSort<MenuPerformanceSortKey>>({ key: 'name', direction: 'asc' })
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [printTime, setPrintTime] = useState(reportPrintTime)
  const periodIsValid = Boolean(draftStartDate && draftEndDate && draftStartDate <= draftEndDate)
  const appliedPeriodIsValid = Boolean(period.startDate && period.endDate && period.startDate <= period.endDate)

  const performanceQuery = useQuery({
    queryKey: [...MENU_PERFORMANCE_QUERY_KEY, period.startDate, period.endDate, page, sort],
    queryFn: () => fetchMenuPerformancePage(period.startDate, period.endDate, page, sort),
    enabled: user?.role === 'admin' && appliedPeriodIsValid,
  })
  const summaryQuery = useQuery({
    queryKey: [...SUMMARY_QUERY_KEY, period.startDate, period.endDate],
    queryFn: () => fetchReportSummary(period.startDate, period.endDate),
    enabled: user?.role === 'admin' && appliedPeriodIsValid,
  })

  const data = performanceQuery.data
  const rows = data?.rows ?? []
  const totals = data?.totals

  const applyPeriod = () => {
    setPeriod({ startDate: draftStartDate, endDate: draftEndDate })
    setPage(1)
  }

  const updateSort = (key: MenuPerformanceSortKey) => {
    setSort((current) => ({ key, direction: current.key === key ? (current.direction === 'asc' ? 'desc' : 'asc') : key === 'name' ? 'asc' : 'desc' }))
    setPage(1)
  }

  const exportReport = async (delimiter: ',' | ';') => {
    setIsExporting(true)
    setExportError('')
    try {
      const allRows = await fetchAllMenuPerformance(period.startDate, period.endDate, sort)
      const csv = createCsv([
        [id.menuPerformance.csvHeaders.menu, id.menuPerformance.csvHeaders.category, id.menuPerformance.csvHeaders.portions, id.menuPerformance.csvHeaders.baseSales, id.menuPerformance.csvHeaders.optionSales, id.menuPerformance.csvHeaders.revenue, id.menuPerformance.csvHeaders.grossProfit, id.menuPerformance.csvHeaders.margin],
        ...allRows.map((row) => [row.name, row.category, row.portions, row.base_sales, row.option_sales, row.revenue, row.gross_profit, row.margin_pct]),
      ], delimiter)
      downloadCsv(csv, `performa-menu-${period.startDate}-${period.endDate}.csv`)
    } catch (error) {
      setExportError(apiError(error, id.menuPerformance.exportError))
    } finally {
      setIsExporting(false)
    }
  }

  const printReport = () => {
    setPrintTime(reportPrintTime())
    window.setTimeout(() => window.print(), 30)
  }

  const money = (value: number | undefined) => performanceQuery.isPending ? id.reporting.loading : performanceQuery.isError ? '—' : formatRupiah(value ?? 0)
  const count = (value: number | undefined) => performanceQuery.isPending ? id.reporting.loading : performanceQuery.isError ? '—' : String(value ?? 0)
  const rangeStart = performanceQuery.data?.count ? (page - 1) * REPORT_PAGE_SIZE + 1 : 0
  const rangeEnd = Math.min(page * REPORT_PAGE_SIZE, performanceQuery.data?.count ?? 0)

  return (
    <div className="reports-page menu-performance-page">
      <section className="report-card menu-performance-toolbar" aria-label={id.menuPerformance.period}>
        <ReportControls
          variant="menu"
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

      <header className="menu-performance-heading">
        <span className="report-eyebrow is-rust">{id.menuPerformance.eyebrow}</span>
        <h1>{id.menuPerformance.title}</h1>
      </header>

      {performanceQuery.isError && <p className="report-error" role="alert">{apiError(performanceQuery.error, id.menuPerformance.loadError)}</p>}
      {exportError && <p className="report-error" role="alert">{exportError}</p>}

      <section className="menu-performance-metrics" aria-label={id.menuPerformance.metricsLabel}>
        <article className="menu-performance-metric is-portions">
          <div><h2>{id.menuPerformance.portionsSold}</h2><p>{count(totals?.portions)} <span>{id.menuPerformance.portionsUnit}</span></p></div>
          <span className="menu-performance-metric-icon"><Coffee aria-hidden="true" /></span>
        </article>
        <article className="menu-performance-metric is-base">
          <div><h2>{id.menuPerformance.baseSales}</h2><p>{money(totals?.base_sales)}</p><small>{totals ? `${totals.base_share_pct.toFixed(1)}% ${id.menuPerformance.ofRevenue}` : performanceQuery.isPending ? id.reporting.loading : '—'}</small></div>
          <span className="menu-performance-metric-icon"><ShoppingBag aria-hidden="true" /></span>
        </article>
        <article className="menu-performance-metric is-options">
          <div><h2>{id.menuPerformance.optionSales}</h2><p>{money(totals?.option_sales)}</p><small>{totals ? `${totals.option_share_pct.toFixed(1)}% ${id.menuPerformance.extraAddOn}` : performanceQuery.isPending ? id.reporting.loading : '—'}</small></div>
          <span className="menu-performance-metric-icon"><TrendingUp aria-hidden="true" /></span>
        </article>
        <article className="menu-performance-metric is-profit">
          <div><h2>{id.menuPerformance.grossProfit}</h2><p>{money(totals?.gross_profit)}</p></div>
          <span className="menu-performance-metric-icon"><BarChart3 aria-hidden="true" /></span>
        </article>
      </section>

      <section className="report-card menu-performance-table-card" aria-labelledby="menu-performance-table-title">
        <div className="report-section-heading menu-performance-table-heading">
          <h2 id="menu-performance-table-title"><span className="report-heading-bar is-rust" />{id.menuPerformance.tableTitle}</h2>
          <span className="menu-performance-count">{count(data?.count)} {id.menuPerformance.itemsRecorded}</span>
        </div>
        <div className="report-table-scroll" role="region" aria-label={id.menuPerformance.tableRegion} tabIndex={0}>
          <table className="report-table menu-performance-table">
            <thead><tr>
              <SortHeading label={id.menuPerformance.menuColumn} sortKey="name" sort={sort} onSort={updateSort} align="left" />
              <SortHeading label={id.menuPerformance.portionsColumn} sortKey="portions" sort={sort} onSort={updateSort} />
              <SortHeading label={id.menuPerformance.baseColumn} sortKey="base_sales" sort={sort} onSort={updateSort} />
              <SortHeading label={id.menuPerformance.optionsColumn} sortKey="option_sales" sort={sort} onSort={updateSort} />
              <SortHeading label={id.menuPerformance.revenueColumn} sortKey="revenue" sort={sort} onSort={updateSort} />
              <SortHeading label={id.menuPerformance.grossColumn} sortKey="gross_profit" sort={sort} onSort={updateSort} />
            </tr></thead>
            <tbody>
              {performanceQuery.isPending ? <tr><td className="report-table-state" colSpan={6}>{id.reporting.loading}</td></tr> : performanceQuery.isError ? <tr><td className="report-table-state" colSpan={6}>{id.menuPerformance.loadError}</td></tr> : rows.length === 0 ? <tr><td className="report-table-state" colSpan={6}>{id.menuPerformance.empty}</td></tr> : rows.map((row) => <tr key={row.menu_id}>
                <td className="menu-report-name-cell"><CategoryIcon category={row.category} /><span><strong>{row.name}</strong><small>{row.category}</small></span></td>
                <td className="is-numeric"><span className="report-order-pill">{row.portions} {id.menuPerformance.portionsUnit}</span></td>
                <td className="is-numeric">{formatRupiah(row.base_sales)}</td>
                <td className="is-numeric menu-report-option-value">{formatRupiah(row.option_sales)}{row.top_modifier_name && row.top_modifier_revenue > 0 && <span className="menu-report-modifier-chip">({row.top_modifier_name})</span>}</td>
                <td className="is-numeric menu-report-revenue-value">{formatRupiah(row.revenue)}</td>
                <td className="is-numeric menu-report-profit-value"><strong>{formatRupiah(row.gross_profit)}</strong><small>{row.margin_pct.toFixed(1)}%</small></td>
              </tr>)}
            </tbody>
            {!performanceQuery.isPending && !performanceQuery.isError && totals && <tfoot><tr className="report-total-row">
              <th scope="row"><BarChart3 aria-hidden="true" />{id.menuPerformance.grandTotal}</th>
              <td className="is-numeric">{totals.portions} {id.menuPerformance.portionsUnit}</td>
              <td className="is-numeric">{formatRupiah(totals.base_sales)}</td>
              <td className="is-numeric">{formatRupiah(totals.option_sales)}</td>
              <td className="is-numeric menu-report-revenue-value">{formatRupiah(totals.revenue)}</td>
              <td className="is-numeric menu-report-profit-value">{formatRupiah(totals.gross_profit)}</td>
            </tr></tfoot>}
          </table>
        </div>
        <ReportPagination page={page} count={data?.count ?? 0} onPageChange={setPage} itemLabel="menus" />
        <p className="menu-performance-footnote">{id.menuPerformance.footer.replace('{from}', String(rangeStart)).replace('{to}', String(rangeEnd)).replace('{total}', String(data?.count ?? 0))}</p>
      </section>

      <ReportPrintHeader
        businessName={summaryQuery.data?.business_name ?? id.reporting.printBusiness}
        title={id.menuPerformance.title}
        startDate={period.startDate}
        endDate={period.endDate}
        printedBy={user?.username ?? ''}
        printedAt={printTime}
      />
    </div>
  )
}
