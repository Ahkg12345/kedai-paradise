import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from 'recharts'
import { AlertTriangle, Banknote, CalendarDays, Check, CircleAlert, CircleCheck, ClipboardList, CookingPot, CreditCard, FileWarning, HandCoins, LockKeyhole, TrendingUp, WalletCards } from 'lucide-react'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { apiError } from '@/lib/api-error'
import { formatDateTimeWib, formatDateWib, formatRupiah, formatSignedRupiah } from '@/lib/format'
import { id } from '@/lib/i18n/id'
import { supabase } from '@/lib/supabase/client'
import type { DashboardTrendPoint, ExecutiveDashboard as ExecutiveDashboardData } from './dashboard-data'

type ExecutiveDashboardProps = {
  data: ExecutiveDashboardData
}

type TrendPoint = DashboardTrendPoint & { isToday: boolean }

type RevenueLabelProps = {
  x?: number
  y?: number
  width?: number
  value?: number | string
  payload?: TrendPoint
}

const chartConfig = {
  revenue: { label: id.dashboard.revenueToday, color: 'var(--green-mid)' },
} satisfies ChartConfig

function compactThousands(value: number) {
  return value >= 1_000 ? `${Math.round(value / 1_000)}k` : String(value)
}

function shortDate(value: string) {
  return formatDateWib(`${value}T00:00:00+07:00`).slice(0, 5)
}

function RevenueLabel({ x = 0, y = 0, width = 0, value = 0, payload }: RevenueLabelProps) {
  const amount = compactThousands(Number(value))
  const isToday = payload?.isToday === true
  const label = isToday ? id.dashboard.todayBubble.replace('{amount}', amount) : amount
  const labelWidth = isToday ? 132 : Math.max(42, label.length * 7 + 14)
  const labelX = x + width / 2 - labelWidth / 2
  const labelY = Math.max(5, y - 31)

  return (
    <g className={isToday ? 'dashboard-chart-today-label' : 'dashboard-chart-bar-label'}>
      <rect x={labelX} y={labelY} width={labelWidth} height={isToday ? 25 : 19} rx={isToday ? 13 : 4} />
      <text x={x + width / 2} y={labelY + (isToday ? 17 : 13)} textAnchor="middle">{label}</text>
    </g>
  )
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  icon: React.ReactNode
  label: string
  value: string
  detail?: string
  tone?: 'neutral' | 'rust' | 'green' | 'red'
}) {
  return (
    <article className={`executive-metric-card is-${tone}`}>
      <div className="executive-metric-heading"><span>{label}</span><i aria-hidden="true">{icon}</i></div>
      <strong className="executive-metric-value">{value}</strong>
      {detail && <span className="executive-metric-detail">{detail}</span>}
    </article>
  )
}

function RevenueTrend({ data }: { data: TrendPoint[] }) {
  const firstDate = data[0]?.date
  const lastDate = data.at(-1)?.date

  return (
    <section className="executive-panel trend-panel" aria-labelledby="dashboard-trend-title">
      <div className="executive-panel-heading trend-heading">
        <div>
          <h2 id="dashboard-trend-title"><TrendingUp size={23} aria-hidden="true" />{id.dashboard.trendTitle}</h2>
          {firstDate && lastDate && <p>{id.dashboard.trendPeriod.replace('{start}', shortDate(firstDate)).replace('{end}', shortDate(lastDate))}</p>}
        </div>
        <div className="trend-legend" aria-label={id.dashboard.trendTitle}>
          <span><i className="is-past" />{id.dashboard.yesterday}</span>
          <span><i className="is-today" />{id.dashboard.todayLegend}</span>
        </div>
      </div>
      {data.length === 0 ? <p className="dashboard-empty-copy">{id.dashboard.noTrend}</p> : (
        <ChartContainer config={chartConfig} className="dashboard-trend-chart" role="img" aria-label={id.dashboard.trendTitle}>
          <BarChart accessibilityLayer data={data} margin={{ top: 43, right: 16, left: 6, bottom: 3 }}>
            <CartesianGrid vertical={false} strokeDasharray="4 5" stroke="rgba(25, 28, 27, 0.1)" />
            <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={{ stroke: '#d7d9d6' }} tickMargin={11} />
            <YAxis tickFormatter={(value: number) => compactThousands(value)} tickLine={false} axisLine={false} width={46} />
            <ChartTooltip cursor={{ fill: 'rgba(35, 78, 64, 0.06)' }} formatter={(value) => formatRupiah(Number(value))} labelFormatter={(value) => shortDate(String(value))} />
            <Bar dataKey="revenue" radius={[6, 6, 0, 0]} maxBarSize={56}>
              {data.map((point) => <Cell key={point.date} fill={point.isToday ? 'var(--rust)' : 'var(--green-mid)'} />)}
              <LabelList dataKey="revenue" content={(props) => <RevenueLabel {...props as RevenueLabelProps} />} />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </section>
  )
}

function CashClosingStatus({ data }: { data: ExecutiveDashboardData }) {
  const closing = data.closing
  const difference = closing.difference ?? 0
  const time = closing.closed_at ? formatDateTimeWib(closing.closed_at).split(' ')[1] : id.notAvailable
  const differenceLabel = difference === 0
    ? id.cashClosing.exactDifference
    : difference < 0
      ? id.cashClosing.shortDifference.replace('{amount}', formatSignedRupiah(difference))
      : id.cashClosing.surplusDifference.replace('{amount}', formatSignedRupiah(difference))

  return (
    <section className="executive-panel closing-status-panel" aria-labelledby="closing-status-title">
      <div className="executive-panel-heading">
        <h2 id="closing-status-title">{id.dashboard.closingStatus}</h2>
        <LockKeyhole size={22} aria-hidden="true" />
      </div>
      {closing.is_closed ? (
        <div className="closing-status-card">
          <span className="closing-state-pill is-closed"><CircleCheck size={16} aria-hidden="true" />{id.dashboard.isClosed}</span>
          <div className="closing-status-row"><span>{id.dashboard.closedBy}</span><strong className="closing-operator"><i>{closing.username?.charAt(0).toUpperCase() ?? '—'}</i>{closing.username ?? id.notAvailable}</strong></div>
          <div className="closing-status-row"><span>{id.dashboard.sessionTime}</span><strong>{time} {id.wib}</strong></div>
          <div className={`closing-difference-box ${difference < 0 ? 'is-short' : difference > 0 ? 'is-surplus' : 'is-even'}`}>
            {difference === 0 ? <CircleCheck size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
            <span>{id.dashboard.physicalDifference}</span><strong>{differenceLabel}</strong>
          </div>
        </div>
      ) : (
        <div className="closing-status-card is-open">
          <span className="closing-state-pill is-open"><CircleAlert size={16} aria-hidden="true" />{id.dashboard.notClosed}</span>
          <p>{id.dashboard.noClosingYet}</p>
        </div>
      )}
      <div className="closing-cash-summary">
        <span>{id.dashboard.systemCash} <strong>{formatRupiah(closing.expected_cash ?? data.cash_balance)}</strong></span>
        <span>{id.dashboard.physicalCash} <strong>{closing.counted_cash === null ? id.notAvailable : formatRupiah(closing.counted_cash)}</strong></span>
      </div>
      <Link to="/tutup-kasir" className="closing-dashboard-link"><ClipboardList size={18} aria-hidden="true" />{id.dashboard.openCashClosing}</Link>
    </section>
  )
}

function TopMenuItems({ data }: { data: ExecutiveDashboardData }) {
  return (
    <section className="executive-panel top-items-panel" aria-labelledby="top-items-title">
      <div className="executive-panel-heading top-items-heading">
        <div><h2 id="top-items-title">{id.dashboard.topItemsTitle}</h2><p>{id.dashboard.topItemsSubtitle}</p></div>
      </div>
      <div className="top-items-table-wrap">
        <table className="top-items-table">
          <thead><tr><th>{id.dashboard.rankAndName}</th><th>{id.dashboard.portionsSold}</th><th>{id.dashboard.revenueContribution}</th></tr></thead>
          <tbody>
            {data.top_items.map((item) => (
              <tr key={item.menu_id}>
                <td><span className={`top-item-rank rank-${item.rank <= 2 ? item.rank : 'other'}`}>{item.rank}</span><span className="top-item-copy"><strong>{item.name}{item.rank === 1 && ' • Best Seller'}</strong><small>{item.category}</small></span></td>
                <td><span className="portion-count">{item.portions} {id.dashboard.portionsSuffix}</span></td>
                <td><strong className="top-item-revenue">{formatRupiah(item.revenue)}</strong></td>
              </tr>
            ))}
            {data.top_items.length === 0 && <tr><td colSpan={3}><p className="dashboard-empty-copy">{id.dashboard.noTopItems}</p></td></tr>}
          </tbody>
        </table>
      </div>
      <footer className="top-items-footer">
        <span>{id.dashboard.contributionTop.replace('{count}', String(data.top_items.length)).replace('{amount}', formatRupiah(data.top_items_revenue))}</span>
        <strong>{id.dashboard.portionsServed.replace('{count}', String(data.top_items_portions))}</strong>
      </footer>
    </section>
  )
}

function OperationalWarnings({ data }: { data: ExecutiveDashboardData }) {
  const queryClient = useQueryClient()
  const availabilityMutation = useMutation({
    mutationFn: async (menuId: number) => {
      const { error } = await supabase.rpc('set_menu_available', { p_menu_id: menuId, p_available: true })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboard', 'executive'] }),
  })

  if (data.operational_issue_count === 0) {
    return (
      <section className="executive-panel operational-panel" aria-labelledby="operational-title">
        <div className="executive-panel-heading"><h2 id="operational-title"><FileWarning size={20} aria-hidden="true" />{id.dashboard.operationalWarnings}</h2><span className="issue-count">0 {id.dashboard.issueCount.replace('{count}', '').trim()}</span></div>
        <p className="no-operational-warnings"><CircleCheck size={20} aria-hidden="true" />{id.dashboard.noWarnings}</p>
      </section>
    )
  }

  return (
    <section className="executive-panel operational-panel" aria-labelledby="operational-title">
      <div className="executive-panel-heading"><h2 id="operational-title"><FileWarning size={20} aria-hidden="true" />{id.dashboard.operationalWarnings}</h2><span className="issue-count">{id.dashboard.issueCount.replace('{count}', String(data.operational_issue_count))}</span></div>
      <div className="operational-warning-list">
        {data.unavailable_count > 0 && (
          <article className="operational-warning-card">
            <div className="warning-card-heading"><span className="warning-icon inventory"><HandCoins size={20} aria-hidden="true" /></span><div><small>{id.dashboard.inventoryEmpty}</small><strong>{id.dashboard.emptyMenuCount.replace('{count}', String(data.unavailable_count))}: {data.unavailable_items.map((item) => item.name).join(', ')}</strong></div></div>
            {data.unavailable_items.map((item) => (
              <div className="unavailable-item-row" key={item.menu_id}>
                <span>{item.name}</span>
                <div><small>{id.dashboard.cashierCannotAdd}</small><button type="button" disabled={availabilityMutation.isPending} onClick={() => availabilityMutation.mutate(item.menu_id)}><Check size={15} aria-hidden="true" />{availabilityMutation.isPending ? id.dashboard.markingAvailable : id.dashboard.markAvailable}</button></div>
              </div>
            ))}
            {availabilityMutation.isError && <p className="dashboard-inline-error" role="alert">{apiError(availabilityMutation.error)}</p>}
          </article>
        )}
        {data.void_count > 0 && (
          <article className="operational-warning-card void-warning-card">
            <div className="warning-card-heading"><span className="warning-icon void"><CircleAlert size={20} aria-hidden="true" /></span><div><small>{id.dashboard.voidSection}</small><strong>{id.dashboard.voidedToday.replace('{count}', String(data.void_count))}</strong></div></div>
            {data.void_items.map((item) => (
              <div className="void-warning-item" key={item.transaction_id}>
                <div className="void-order-line"><span>{id.dashboard.order.replace('{order}', String(item.order_no).padStart(3, '0'))}</span><strong>{formatRupiah(item.total)} ({id.dashboard.voided})</strong></div>
                <div className="void-reason-line"><span>{id.dashboard.reason} {item.void_reason ?? id.notAvailable}</span><Link to={`/riwayat?transaction=${item.transaction_id}`}>{id.dashboard.detailTransaction}</Link></div>
              </div>
            ))}
          </article>
        )}
      </div>
    </section>
  )
}

export function ExecutiveDashboard({ data }: ExecutiveDashboardProps) {
  const date = formatDateWib(`${data.date}T00:00:00+07:00`)
  const trend: TrendPoint[] = data.trend.map((point) => ({ ...point, isToday: point.date === data.date }))
  const averageOrder = id.dashboard.averageOrder.replace('{amount}', formatRupiah(data.average_order))

  return (
    <section className="executive-dashboard-page" aria-labelledby="executive-dashboard-title">
      <header className="executive-dashboard-heading">
        <div className="executive-title-group"><span className="executive-title-icon"><TrendingUp size={28} aria-hidden="true" /></span><div><p>{id.dashboard.executiveEyebrow}</p><h1 id="executive-dashboard-title">{id.dashboard.executiveTitle}</h1></div></div>
        <span className="dashboard-date-chip"><CalendarDays size={19} aria-hidden="true" />{id.dashboard.today.replace('{date}', `${date} WIB`)}</span>
      </header>

      <div className="executive-metrics-grid">
        <MetricCard icon={<Banknote size={20} />} label={id.dashboard.revenueToday} value={formatRupiah(data.revenue)} tone="rust" />
        <MetricCard icon={<WalletCards size={20} />} label={id.dashboard.grossProfitToday} value={formatRupiah(data.gross_profit)} tone="green" />
        <MetricCard icon={<ClipboardList size={20} />} label={id.dashboard.totalTransactions} value={`${data.transaction_count} ${id.dashboard.ordersSuffix}`} detail={averageOrder} />
        <MetricCard icon={<CookingPot size={20} />} label={id.dashboard.activeQueue} value={`${data.processing_count} ${id.dashboard.ordersSuffix}`} detail={id.dashboard.cooking} tone="red" />
        <MetricCard icon={<CreditCard size={20} />} label={id.dashboard.cashBalanceToday} value={formatRupiah(data.cash_balance)} detail={id.dashboard.cashSystem} />
        <MetricCard icon={<HandCoins size={20} />} label={id.dashboard.drawerCounted} value={data.drawer_counted === null ? id.notAvailable : formatRupiah(data.drawer_counted)} detail={id.dashboard.openingCapital} />
      </div>

      <div className="executive-primary-grid">
        <RevenueTrend data={trend} />
        <CashClosingStatus data={data} />
      </div>
      <div className="executive-secondary-grid">
        <TopMenuItems data={data} />
        <OperationalWarnings data={data} />
      </div>
    </section>
  )
}
