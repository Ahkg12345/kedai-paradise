import { id } from '@/lib/i18n/id'
import { formatPeriodDate } from './report-utils'

export function ReportPrintHeader({
  businessName,
  title,
  startDate,
  endDate,
  printedBy,
  printedAt,
}: {
  businessName: string
  title: string
  startDate: string
  endDate: string
  printedBy: string
  printedAt: string
}) {
  return (
    <header className="report-print-header">
      <strong>{businessName}</strong>
      <h2>{title}</h2>
      <p>{id.reporting.printPeriod.replace('{start}', formatPeriodDate(startDate)).replace('{end}', formatPeriodDate(endDate))}</p>
      <p>{id.reporting.printBy.replace('{name}', printedBy)}</p>
      <p>{id.reporting.printTime.replace('{time}', printedAt)}</p>
    </header>
  )
}
