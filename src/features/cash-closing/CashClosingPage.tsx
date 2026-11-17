import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/app/session-context'
import { currentWibDate } from '@/lib/format'
import { apiError } from '@/lib/api-error'
import { id } from '@/lib/i18n/id'
import { fetchCashClosingHistory, fetchCashClosingPreview } from './cash-closing-data'
import { CashierCashClosing } from './CashierCashClosing'
import { AdminCashClosing } from './AdminCashClosing'
import './cash-closing.css'

function getClosingDates(today: string) {
  const [year, month, day] = today.split('-').map(Number)
  const base = new Date(Date.UTC(year, month - 1, day, 12))

  return Array.from({ length: 30 }, (_, offset) => {
    const date = new Date(base)
    date.setUTCDate(base.getUTCDate() - offset)
    return date.toISOString().slice(0, 10)
  })
}

export function CashClosingPage() {
  const { user } = useSession()
  const isAdmin = user?.role === 'admin'
  const today = currentWibDate()
  const [selectedDate, setSelectedDate] = useState(today)
  const historyQuery = useQuery({
    queryKey: ['cash-closing-history'],
    queryFn: fetchCashClosingHistory,
    enabled: Boolean(user),
    staleTime: 30_000,
  })
  const previewQuery = useQuery({
    queryKey: ['cash-closing-preview', selectedDate],
    queryFn: () => fetchCashClosingPreview(selectedDate),
    enabled: Boolean(user) && isAdmin,
    staleTime: 15_000,
  })

  if (historyQuery.isPending || (isAdmin && previewQuery.isPending)) {
    return <p className="cash-closing-state" role="status" aria-busy="true">{id.cashClosing.loading}</p>
  }

  if (historyQuery.isError) {
    return <p className="cash-closing-state is-error" role="alert">{apiError(historyQuery.error, id.cashClosing.loadError)}</p>
  }

  if (isAdmin && previewQuery.isError) {
    return <p className="cash-closing-state is-error" role="alert">{apiError(previewQuery.error, id.cashClosing.loadError)}</p>
  }

  const history = historyQuery.data ?? []

  return isAdmin ? (
    <AdminCashClosing
      key={selectedDate}
      selectedDate={selectedDate}
      dates={getClosingDates(today)}
      today={today}
      preview={previewQuery.data!}
      history={history}
      onDateChange={setSelectedDate}
    />
  ) : (
    <CashierCashClosing history={history} />
  )
}
