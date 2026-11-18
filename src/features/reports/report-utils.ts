import { formatDateTimeWib } from '@/lib/format'

export function safeCsvCell(value: string | number, protectFormula = true): string {
  let text = String(value)
  if (protectFormula && /^[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function createCsv(values: Array<Array<string | number>>, delimiter: ',' | ';'): Blob {
  const rows = values.map((row) => row.map((value) => safeCsvCell(value)).join(delimiter)).join('\r\n')
  return new Blob([`\uFEFF${rows}`], { type: 'text/csv;charset=utf-8' })
}

export function downloadCsv(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export function formatPeriodDate(value: string): string {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

export function reportPrintTime(): string {
  return formatDateTimeWib(new Date())
}

export function cashShare(amount: number, revenue: number): number {
  return revenue === 0 ? 0 : Math.round(amount * 100 / revenue)
}
