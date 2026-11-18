import { ChevronLeft, ChevronRight } from 'lucide-react'
import { id } from '@/lib/i18n/id'

export function ReportPagination({
  page,
  count,
  onPageChange,
  itemLabel,
}: {
  page: number
  count: number
  onPageChange: (page: number) => void
  itemLabel: 'days' | 'menus'
}) {
  const pageCount = Math.max(1, Math.ceil(count / 50))
  const first = count ? (page - 1) * 50 + 1 : 0
  const last = Math.min(page * 50, count)
  const sentence = itemLabel === 'days' ? id.reporting.showingDaily : id.menuPerformance.showingMenus

  return (
    <footer className="report-pagination">
      <p>{sentence.replace('{from}', String(first)).replace('{to}', String(last)).replace('{total}', String(count))}</p>
      <nav aria-label={id.reporting.pagination}>
        <button type="button" aria-label={id.reporting.previousPage} disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft aria-hidden="true" /></button>
        <span aria-current="page">{page}</span>
        <button type="button" aria-label={id.reporting.nextPage} disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}><ChevronRight aria-hidden="true" /></button>
      </nav>
    </footer>
  )
}
