import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDateTimeWib, formatRupiah, currentWibDate } from '@/lib/format'
import { apiError } from '@/lib/api-error'
import { useSession } from '@/app/session-context'
import { id } from '@/lib/i18n/id'
import { FinanceEntryForm } from './FinanceEntryForm'
import { FinanceLedger } from './FinanceLedger'
import { FinanceDeleteDialog } from './FinanceDeleteDialog'
import {
  createFinanceRecord,
  deleteFinanceRecord,
  fetchAllFinance,
  fetchFinancePage,
  FINANCE_QUERY_KEY,
  updateFinanceRecord,
  type FinanceEntryPayload,
  type FinanceFilters,
  type FinanceRecord,
} from './finance-data'
import './finance.css'

function initialFilters(): FinanceFilters {
  const today = currentWibDate()
  return { startDate: `${today.slice(0, 7)}-01`, endDate: today, type: 'all', pool: 'all' }
}

function safeCsvCell(value: string | number) {
  let text = String(value)
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return `\"${text.replace(/\"/g, '\"\"')}\"`
}

function csvRow(values: Array<string | number>, delimiter: ',' | ';') {
  return values.map(safeCsvCell).join(delimiter)
}

function formatPeriodDate(value: string) {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function poolName(pool: FinanceRecord['pool']) {
  if (pool === 'restock') return id.finance.pools.restock
  if (pool === 'operating') return id.finance.pools.operating
  return id.finance.pools.profit
}

export function FinancePage() {
  const { user } = useSession()
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<FinanceFilters>(initialFilters)
  const [page, setPage] = useState(1)
  const [editingRecord, setEditingRecord] = useState<FinanceRecord | null>(null)
  const [deleteRecord, setDeleteRecord] = useState<FinanceRecord | null>(null)
  const [resetToken, setResetToken] = useState(0)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [printTime, setPrintTime] = useState(() => formatDateTimeWib(new Date()))

  const financeQuery = useQuery({
    queryKey: [...FINANCE_QUERY_KEY, filters, page],
    queryFn: () => fetchFinancePage(filters, page),
    enabled: user?.role === 'admin' && filters.startDate <= filters.endDate,
  })
  const financeSummaryQuery = useQuery({
    queryKey: [...FINANCE_QUERY_KEY, 'period-summary', filters.startDate, filters.endDate],
    queryFn: () => fetchFinancePage({ ...filters, type: 'all', pool: 'all' }, 1),
    enabled: user?.role === 'admin' && filters.startDate <= filters.endDate,
  })

  const saveMutation = useMutation({
    mutationFn: ({ payload, record }: { payload: FinanceEntryPayload; record: FinanceRecord | null }) =>
      record ? updateFinanceRecord(record.finance_id, payload) : createFinanceRecord(payload),
    onSuccess: async () => {
      setFormError('')
      setEditingRecord(null)
      setPage(1)
      setResetToken((value) => value + 1)
      setNotice({ kind: 'success', message: editingRecord ? id.finance.updateSuccess : id.finance.createSuccess })
      await queryClient.invalidateQueries({ queryKey: FINANCE_QUERY_KEY })
    },
    onError: (error) => setFormError(apiError(error, id.finance.saveError)),
  })

  const updateFilter = <K extends keyof FinanceFilters>(key: K, value: FinanceFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(1)
    setNotice(null)
  }

  const saveEntry = async (payload: FinanceEntryPayload) => {
    setFormError('')
    setNotice(null)
    try {
      await saveMutation.mutateAsync({ payload, record: editingRecord })
    } catch {
      return
    }
  }

  const confirmDelete = async () => {
    if (!deleteRecord) return
    await deleteFinanceRecord(deleteRecord.finance_id)
    setPage(1)
    await queryClient.invalidateQueries({ queryKey: FINANCE_QUERY_KEY })
    setNotice({ kind: 'success', message: id.finance.deleteSuccess })
  }

  const exportCsv = async (delimiter: ',' | ';') => {
    setIsExporting(true)
    setNotice(null)
    try {
      const rows = await fetchAllFinance(filters)
      const headers = [
        id.finance.csvHeaders.date,
        id.finance.csvHeaders.type,
        id.finance.csvHeaders.category,
        id.finance.csvHeaders.pool,
        id.finance.csvHeaders.amount,
        id.finance.csvHeaders.description,
        id.finance.csvHeaders.user,
      ]
      const lines = [csvRow(headers, delimiter), ...rows.map((record) => csvRow([
        formatDateTimeWib(record.date).replace(/ WIB$/, ''),
        record.type,
        record.category,
        poolName(record.pool),
        record.type === 'expense' ? -record.amount : `+${record.amount}`,
        record.description ?? '',
        record.username.length ? `${record.username[0].toUpperCase()}${record.username.slice(1)}` : record.username,
      ], delimiter))]
      const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `buku-kas-${filters.startDate}-${filters.endDate}.csv`
      link.hidden = true
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
    } catch (error) {
      setNotice({ kind: 'error', message: apiError(error, id.finance.exportError) })
    } finally {
      setIsExporting(false)
    }
  }

  const printLedger = () => {
    setPrintTime(formatDateTimeWib(new Date()))
    window.setTimeout(() => window.print(), 30)
  }

  const startEdit = (record: FinanceRecord) => {
    setFormError('')
    setNotice(null)
    setEditingRecord(record)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="finance-page">
      <header className="finance-heading">
        <div className="finance-heading-copy">
          <span className="finance-eyebrow">{id.finance.eyebrow}</span>
          <h1>{id.finance.title}</h1>
          <p>{id.finance.subtitle}</p>
        </div>
        <div className="finance-period-summary" aria-label={id.finance.periodSummaryLabel}>
          <div className="finance-period-total is-expense"><span>{id.finance.expenseTotal}</span><strong><span className="finance-summary-dot" aria-hidden="true" />{formatRupiah(financeSummaryQuery.data?.total_expense ?? 0)}</strong></div>
          <div className="finance-period-total is-income"><span>{id.finance.incomeTotal}</span><strong><span className="finance-summary-dot" aria-hidden="true" />{formatRupiah(financeSummaryQuery.data?.total_income ?? 0)}</strong></div>
        </div>
      </header>

      {notice && <p className={`finance-notice is-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.message}<button type="button" aria-label={id.finance.dismissNotice} onClick={() => setNotice(null)}>×</button></p>}

      <FinanceEntryForm
        key={editingRecord?.finance_id ?? 'new-entry'}
        categories={financeQuery.data?.categories ?? []}
        record={editingRecord}
        resetToken={resetToken}
        isSaving={saveMutation.isPending}
        submissionError={formError}
        onSubmit={saveEntry}
        onCancelEdit={() => { setEditingRecord(null); setFormError('') }}
      />

      <div className="finance-print-header" aria-hidden="true">
        <strong>{id.finance.printBusiness}</strong>
        <h2>{id.finance.printTitle}</h2>
        <p>{id.finance.printPeriod.replace('{start}', formatPeriodDate(filters.startDate)).replace('{end}', formatPeriodDate(filters.endDate))}</p>
        <p>{id.finance.printBy.replace('{name}', user?.username ?? '')}</p>
        <p>{id.finance.printTime.replace('{time}', printTime)}</p>
      </div>

      <FinanceLedger
        filters={filters}
        onFilterChange={updateFilter}
        page={page}
        onPageChange={setPage}
        data={financeQuery.data}
        isLoading={financeQuery.isPending || financeQuery.isFetching}
        error={financeQuery.error ? apiError(financeQuery.error, id.finance.loadError) : ''}
        isExporting={isExporting}
        onEdit={startEdit}
        onDelete={(record) => setDeleteRecord(record)}
        onExport={(delimiter) => void exportCsv(delimiter)}
        onPrint={printLedger}
      />

      {deleteRecord && <FinanceDeleteDialog record={deleteRecord} onClose={() => setDeleteRecord(null)} onConfirm={confirmDelete} />}
    </div>
  )
}
