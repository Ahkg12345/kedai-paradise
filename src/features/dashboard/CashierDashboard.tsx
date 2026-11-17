import { Link } from 'react-router-dom'
import { CalendarDays, ClipboardList, Hourglass, List, Store } from 'lucide-react'
import { formatDateWib } from '@/lib/format'
import { id } from '@/lib/i18n/id'
import type { CashierDashboard as CashierDashboardData } from './dashboard-data'

type CashierDashboardProps = {
  data: CashierDashboardData
}

function OrderMetric({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: number
  tone: 'neutral' | 'mint'
}) {
  return (
    <article className={`cashier-metric-card is-${tone}`}>
      <span className="cashier-metric-icon" aria-hidden="true">{icon}</span>
      <h2>{label}</h2>
      <p className="cashier-metric-value"><strong>{value}</strong><span>{id.dashboard.ordersSuffix}</span></p>
    </article>
  )
}

export function CashierDashboard({ data }: CashierDashboardProps) {
  return (
    <section className="cashier-dashboard-page" aria-labelledby="cashier-dashboard-title">
      <div className="cashier-dashboard-heading">
        <h1 id="cashier-dashboard-title"><span aria-hidden="true" />{id.dashboard.cashierTitle}</h1>
        <span className="dashboard-date-chip"><CalendarDays size={19} aria-hidden="true" />{id.dashboard.today.replace('{date}', formatDateWib(`${data.date}T00:00:00+07:00`))}</span>
      </div>

      <div className="cashier-metrics-grid">
        <OrderMetric icon={<ClipboardList size={27} />} label={id.dashboard.totalOrdersToday} value={data.total_orders} tone="neutral" />
        <OrderMetric icon={<Hourglass size={27} />} label={id.dashboard.processingOrders} value={data.processing_orders} tone="mint" />
      </div>

      <div className="cashier-dashboard-actions">
        <Link className="cashier-dashboard-action is-open" to="/kasir"><Store size={22} aria-hidden="true" />{id.dashboard.openCashier}</Link>
        <Link className="cashier-dashboard-action is-queue" to="/antrian"><List size={22} aria-hidden="true" />{id.dashboard.queue}<span>{data.processing_orders}</span></Link>
      </div>
    </section>
  )
}
