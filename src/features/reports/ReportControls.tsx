import { useState } from 'react'
import { CalendarDays, ChevronDown, Download, Filter, Printer } from 'lucide-react'
import { id } from '@/lib/i18n/id'

type ReportControlsProps = {
  startDate: string
  endDate: string
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onApply: () => void
  onExport: (delimiter: ',' | ';') => void
  onPrint: () => void
  isExporting: boolean
  invalidPeriod: boolean
  variant?: 'summary' | 'menu'
}

export function ReportControls({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onApply,
  onExport,
  onPrint,
  isExporting,
  invalidPeriod,
  variant = 'menu',
}: ReportControlsProps) {
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const labels = id.reporting

  return (
    <div className={`report-controls report-controls-${variant}`}>
      <div className="report-period-fields" role="group" aria-label={labels.period}>
        <CalendarDays aria-hidden="true" />
        <span className="report-period-label">{labels.period}:</span>
        <label className="sr-only" htmlFor={`report-start-${variant}`}>{labels.startDateLabel}</label>
        <input id={`report-start-${variant}`} type="date" value={startDate} onChange={(event) => onStartDateChange(event.target.value)} />
        <span className="report-date-separator">{labels.dateSeparator}</span>
        <label className="sr-only" htmlFor={`report-end-${variant}`}>{labels.endDateLabel}</label>
        <input id={`report-end-${variant}`} type="date" value={endDate} onChange={(event) => onEndDateChange(event.target.value)} />
      </div>
      <button className="report-apply-button" type="button" disabled={invalidPeriod} onClick={onApply}>
        <Filter aria-hidden="true" />{labels.apply}
      </button>
      <div className="report-export-wrap">
        <button
          className="report-secondary-button"
          type="button"
          aria-expanded={exportMenuOpen}
          aria-haspopup="menu"
          disabled={isExporting || invalidPeriod}
          onClick={() => setExportMenuOpen((open) => !open)}
        >
          <Download aria-hidden="true" />{isExporting ? labels.exporting : labels.export}<ChevronDown aria-hidden="true" />
        </button>
        {exportMenuOpen && <div className="report-export-menu" role="menu" aria-label={labels.exportOptions}>
          <button type="button" role="menuitem" onClick={() => { setExportMenuOpen(false); onExport(',') }}>{labels.exportComma}</button>
          <button type="button" role="menuitem" onClick={() => { setExportMenuOpen(false); onExport(';') }}>{labels.exportSemicolon}</button>
        </div>}
      </div>
      <button className="report-secondary-button report-print-button" type="button" disabled={invalidPeriod} onClick={onPrint}>
        <Printer aria-hidden="true" />{labels.printPdf}
      </button>
      {invalidPeriod && <p className="report-range-error" role="alert">{labels.invalidPeriod}</p>}
    </div>
  )
}
