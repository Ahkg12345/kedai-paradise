import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDateTimeWib } from '@/lib/format'
import { id } from '@/lib/i18n/id'
import { apiError } from '@/lib/api-error'
import { supabase } from '@/lib/supabase/client'
import { checkoutMetaQueryKey } from '@/features/pos/use-checkout-meta'
import { CheckCircle2, Clock3, LoaderCircle, RefreshCw, ShoppingBag, Soup, Timer } from 'lucide-react'
import type { QueuePayload, QueueTicket } from './queue-types'
import './queue.css'

const queueQueryKey = ['order-queue'] as const
const AUTO_REFRESH_MS = 15_000

async function fetchQueue(): Promise<QueuePayload> {
  const { data, error } = await supabase.rpc('get_queue')
  if (error) throw error
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(id.queue.loadError)

  const payload = data as unknown as QueuePayload
  if (!Array.isArray(payload.active) || !Array.isArray(payload.completed) || typeof payload.order_date !== 'string') {
    throw new Error(id.queue.loadError)
  }
  return payload
}

async function completeOrder(transactionId: number) {
  const { error } = await supabase.rpc('complete_order', { p_transaction_id: transactionId })
  if (error) throw error
}

function formatTime(value: string) {
  return formatDateTimeWib(value).split(' ')[1] ?? id.notAvailable
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = safeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function ticketAgeSeconds(date: string, now: number) {
  const timestamp = new Date(date).getTime()
  return Number.isFinite(timestamp) ? Math.max(0, Math.floor((now - timestamp) / 1000)) : 0
}

function QueueTicketCard({
  ticket,
  now,
  isCompleting,
  onComplete,
}: {
  ticket: QueueTicket
  now: number
  isCompleting: boolean
  onComplete: () => void
}) {
  const ageSeconds = ticketAgeSeconds(ticket.date, now)
  const ageClass = ageSeconds < 600 ? 'is-fresh' : ageSeconds <= 1200 ? 'is-warming' : 'is-urgent'
  const isTakeaway = ticket.table_no === 'TA'
  const orderNumber = String(ticket.order_no).padStart(3, '0')

  return (
    <article className={`queue-ticket ${ageClass}`} aria-label={`${id.queue.orderNumberPrefix} ${orderNumber}`}>
      <div className="queue-ticket-topline">
        <div>
          {ageClass === 'is-urgent' && <p className="queue-urgent-label"><span aria-hidden="true" />{id.queue.urgent}</p>}
          <p className="queue-ticket-type">{isTakeaway ? id.queue.takeawayTicket : id.queue.tableTicket}</p>
          <h3>{id.queue.orderNumberPrefix} {orderNumber}</h3>
        </div>
        <span className={`queue-table-chip${isTakeaway ? ' is-takeaway' : ''}`}>
          {isTakeaway && <ShoppingBag size={16} aria-hidden="true" />}
          {isTakeaway ? id.pos.takeAwayAbbreviation : id.pos.tableNumber.replace('{number}', String(Number(ticket.table_no)).padStart(2, '0'))}
        </span>
      </div>

      <div className="queue-time-strip">
        <span className="queue-entered"><Clock3 size={17} aria-hidden="true" />{id.queue.enteredAt} <strong>{formatTime(ticket.date)}</strong></span>
        <span className="queue-age-pill"><Timer size={16} aria-hidden="true" />{id.queue.age} <strong>{formatDuration(ageSeconds)}</strong></span>
      </div>

      <ul className="queue-items" aria-label={id.queue.items}>
        {ticket.items.map((item) => (
          <li className="queue-item" key={item.order_id}>
            <strong>{item.quantity}x {item.name}</strong>
            {item.modifiers.length > 0 && <span className="queue-item-modifiers">≡ [{item.modifiers.join(', ')}]</span>}
            {item.note && <span className="queue-item-note">{id.pos.notePrefix} {item.note}</span>}
          </li>
        ))}
      </ul>

      <button className="queue-complete-button" type="button" onClick={onComplete} disabled={isCompleting}>
        {isCompleting ? <LoaderCircle size={19} className="queue-spin" aria-hidden="true" /> : <CheckCircle2 size={20} aria-hidden="true" />}
        {isCompleting ? id.queue.completing : id.queue.complete}
      </button>
    </article>
  )
}

function CompletedOrders({ tickets }: { tickets: QueueTicket[] }) {
  return (
    <section className="queue-completed-panel" aria-labelledby="queue-completed-title">
      <div className="queue-completed-heading">
        <div>
          <h2 id="queue-completed-title">{id.queue.completedToday}</h2>
          <p>{id.queue.completedHint}</p>
        </div>
      </div>
      {tickets.length === 0 ? (
        <p className="queue-empty-completed">{id.queue.emptyCompleted}</p>
      ) : (
        <div className="queue-table-scroll">
          <table className="queue-completed-table">
            <thead>
              <tr>
                <th>{id.queue.columns.order}</th>
                <th>{id.queue.columns.table}</th>
                <th>{id.queue.columns.ordered}</th>
                <th>{id.queue.columns.completed}</th>
                <th>{id.queue.columns.duration}</th>
                <th>{id.queue.columns.cashier}</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.transaction_id}>
                  <td><strong className="queue-completed-order">{String(ticket.order_no).padStart(3, '0')}</strong></td>
                  <td><span className={`queue-table-chip queue-table-chip-small${ticket.table_no === 'TA' ? ' is-takeaway' : ''}`}>{ticket.table_no === 'TA' ? id.pos.takeAwayAbbreviation : id.pos.tableNumber.replace('{number}', String(Number(ticket.table_no)).padStart(2, '0'))}</span></td>
                  <td><time className="queue-mono">{formatTime(ticket.date)} {id.wib}</time></td>
                  <td><time className="queue-mono">{ticket.completed_at ? `${formatTime(ticket.completed_at)} ${id.wib}` : id.notAvailable}</time></td>
                  <td><span className="queue-duration-chip"><span aria-hidden="true" />{id.queue.completedDuration.replace('{duration}', formatDuration(ticket.duration_seconds ?? 0)).replace('{seconds}', String(ticket.duration_seconds ?? 0))}</span></td>
                  <td><span className="queue-cashier"><span className="queue-cashier-avatar" aria-hidden="true">{ticket.username?.charAt(0) || 'K'}</span>{ticket.username || '—'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="queue-completed-footer">{id.queue.footer.replace('{count}', String(tickets.length))}</p>
    </section>
  )
}

export function QueuePage() {
  const queryClient = useQueryClient()
  const [now, setNow] = useState(() => Date.now())
  const [notice, setNotice] = useState('')
  const queueQuery = useQuery({
    queryKey: queueQueryKey,
    queryFn: fetchQueue,
    staleTime: 0,
    refetchInterval: AUTO_REFRESH_MS,
    refetchIntervalInBackground: false,
  })
  const completionMutation = useMutation({
    mutationFn: completeOrder,
    onSuccess: async () => {
      setNotice(id.queue.completeSuccess)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queueQueryKey }),
        queryClient.invalidateQueries({ queryKey: checkoutMetaQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['transaction-history'] }),
      ])
    },
  })

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [])

  const activeTickets = queueQuery.data?.active ?? []
  const completedTickets = queueQuery.data?.completed ?? []
  const updatedAt = queueQuery.dataUpdatedAt || now
  const refreshSeconds = Math.max(0, Math.ceil((AUTO_REFRESH_MS - (now - updatedAt)) / 1_000))
  const pageError = queueQuery.isError ? apiError(queueQuery.error, id.queue.loadError) : ''

  return (
    <div className="queue-page">
      <header className="queue-page-heading">
        <div className="queue-page-title">
          <span className="queue-title-dot" aria-hidden="true" />
          <h1>{id.queue.title}</h1>
          <span className="queue-active-chip">{id.queue.activeCount.replace('{count}', String(activeTickets.length))}</span>
        </div>
        <div className="queue-heading-actions">
          <span className="queue-refresh-chip" role="status"><span aria-hidden="true" />{id.queue.autoRefresh.replace('{seconds}', String(refreshSeconds))}</span>
          <button type="button" className="queue-refresh-button" onClick={() => void queueQuery.refetch()} disabled={queueQuery.isFetching}>
            {queueQuery.isFetching ? <LoaderCircle size={18} className="queue-spin" aria-hidden="true" /> : <RefreshCw size={18} aria-hidden="true" />}
            {id.queue.refresh}
          </button>
        </div>
      </header>

      {notice && <p className="queue-notice" role="status">{notice}</p>}
      {completionMutation.isError && <p className="queue-error-banner" role="alert">{apiError(completionMutation.error)}</p>}
      {pageError && <p className="queue-error-banner" role="alert">{pageError}</p>}

      <section className="queue-running-section" aria-labelledby="queue-running-title" aria-busy={queueQuery.isPending}>
        <div className="queue-section-heading">
          <h2 id="queue-running-title"><Soup size={20} aria-hidden="true" />{id.queue.running}</h2>
          <p>{id.queue.prioritise}</p>
        </div>
        {queueQuery.isPending ? (
          <p className="queue-loading" role="status">{id.queue.loading}</p>
        ) : activeTickets.length === 0 ? (
          <p className="queue-empty-active">{id.queue.emptyActive}</p>
        ) : (
          <div className="queue-ticket-grid">
            {activeTickets.map((ticket) => (
              <QueueTicketCard
                key={ticket.transaction_id}
                ticket={ticket}
                now={now}
                isCompleting={completionMutation.isPending && completionMutation.variables === ticket.transaction_id}
                onComplete={() => {
                  setNotice('')
                  completionMutation.mutate(ticket.transaction_id)
                }}
              />
            ))}
          </div>
        )}
      </section>

      {!queueQuery.isPending && !queueQuery.isError && <CompletedOrders tickets={completedTickets} />}
    </div>
  )
}
