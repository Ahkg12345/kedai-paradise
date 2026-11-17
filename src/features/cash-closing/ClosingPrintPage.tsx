import { useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/app/session-context'
import { apiError } from '@/lib/api-error'
import { formatDateTimeWib, formatDateWib, formatRupiah } from '@/lib/format'
import { id } from '@/lib/i18n/id'
import { fetchCashClosingReport } from './cash-closing-data'

type ClosingReportFieldProps = {
  label: string
  value: string
  emphasize?: boolean
}

function ClosingReportField({ label, value, emphasize = false }: ClosingReportFieldProps) {
  return <div className={`closing-report-field${emphasize ? ' is-emphasized' : ''}`}><dt>{label}</dt><dd>{value}</dd></div>
}

export function ClosingPrintPage() {
  const { id: rawClosingId } = useParams()
  const { user } = useSession()
  const closingId = Number(rawClosingId)
  const printStarted = useRef(false)
  const reportQuery = useQuery({
    queryKey: ['cash-closing-report', closingId],
    queryFn: () => fetchCashClosingReport(closingId),
    enabled: Boolean(user) && user?.role === 'admin' && Number.isSafeInteger(closingId) && closingId > 0,
    staleTime: Infinity,
  })

  useEffect(() => {
    if (!reportQuery.data || printStarted.current) return
    printStarted.current = true
    window.print()
  }, [reportQuery.data])

  if (!Number.isSafeInteger(closingId) || closingId <= 0) {
    return <main className="closing-report-state" role="alert">{id.cashClosing.loadError}</main>
  }
  if (reportQuery.isPending) {
    return <main className="closing-report-state" role="status" aria-busy="true">{id.cashClosing.loading}</main>
  }
  if (reportQuery.isError) {
    return <main className="closing-report-state" role="alert">{apiError(reportQuery.error, id.cashClosing.loadError)}</main>
  }

  const report = reportQuery.data
  const difference = report.difference === 0
    ? '0'
    : `${report.difference > 0 ? '+' : '-'}${formatRupiah(Math.abs(report.difference))}`

  return (
    <main className="closing-report-page" aria-labelledby="closing-report-title">
      <header className="closing-report-heading">
        <strong>{report.business_name}</strong>
        <h1 id="closing-report-title">{id.cashClosing.reportTitle}</h1>
        <p>{id.cashClosing.reportDate}: {formatDateWib(`${report.closing_date}T00:00:00+07:00`)}</p>
      </header>
      <dl className="closing-report-details">
        <ClosingReportField label={id.cashClosing.reportOpening} value={formatRupiah(report.opening_cash)} />
        <ClosingReportField label={id.cashClosing.reportCashSales} value={formatRupiah(report.cash_sales)} />
        <ClosingReportField label={id.cashClosing.reportCashOut} value={formatRupiah(report.cash_out)} />
        <ClosingReportField label={id.cashClosing.reportExpected} value={formatRupiah(report.expected_cash)} emphasize />
        <ClosingReportField label={id.cashClosing.reportCounted} value={formatRupiah(report.counted_cash)} emphasize />
        <ClosingReportField label={id.cashClosing.reportDifference} value={difference} emphasize />
        {report.note && <ClosingReportField label={id.cashClosing.reportNote} value={report.note} />}
        <ClosingReportField label={id.cashClosing.reportCashier} value={report.username} />
        <ClosingReportField label={id.cashClosing.reportPrintTime} value={formatDateTimeWib(report.printed_at)} />
      </dl>
    </main>
  )
}
