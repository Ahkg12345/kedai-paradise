import { supabase } from '@/lib/supabase/client'
import { id } from '@/lib/i18n/id'

export type CashierDashboard = {
  date: string
  total_orders: number
  processing_orders: number
}

export type DashboardTrendPoint = {
  date: string
  revenue: number
}

export type DashboardClosing = {
  is_closed: boolean
  username: string | null
  closed_at: string | null
  expected_cash: number | null
  counted_cash: number | null
  difference: number | null
}

export type DashboardMenuItem = {
  rank: number
  menu_id: number
  name: string
  category: string
  portions: number
  revenue: number
}

export type DashboardUnavailableItem = {
  menu_id: number
  name: string
}

export type DashboardVoidItem = {
  transaction_id: number
  order_no: number
  total: number
  void_reason: string | null
  voided_at: string | null
}

export type ExecutiveDashboard = {
  date: string
  revenue: number
  gross_profit: number
  transaction_count: number
  average_order: number
  processing_count: number
  cash_balance: number
  drawer_counted: number | null
  trend: DashboardTrendPoint[]
  closing: DashboardClosing
  top_items: DashboardMenuItem[]
  top_items_revenue: number
  top_items_portions: number
  unavailable_count: number
  unavailable_items: DashboardUnavailableItem[]
  void_count: number
  void_items: DashboardVoidItem[]
  operational_issue_count: number
}

function toNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toNullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : toNumber(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(id.dashboard.loadError)
  }
  return value as Record<string, unknown>
}

export async function fetchCashierDashboard(): Promise<CashierDashboard> {
  const { data, error } = await supabase.rpc('get_cashier_dashboard')
  if (error) throw error
  const value = asRecord(data)
  if (typeof value.date !== 'string') throw new Error(id.dashboard.loadError)

  return {
    date: value.date,
    total_orders: toNumber(value.total_orders),
    processing_orders: toNumber(value.processing_orders),
  }
}

export async function fetchExecutiveDashboard(): Promise<ExecutiveDashboard> {
  const { data, error } = await supabase.rpc('get_executive_dashboard')
  if (error) throw error
  const value = asRecord(data)
  const closing = asRecord(value.closing)
  if (typeof value.date !== 'string' || !Array.isArray(value.trend) || !Array.isArray(value.top_items)) {
    throw new Error(id.dashboard.loadError)
  }

  return {
    date: value.date,
    revenue: toNumber(value.revenue),
    gross_profit: toNumber(value.gross_profit),
    transaction_count: toNumber(value.transaction_count),
    average_order: toNumber(value.average_order),
    processing_count: toNumber(value.processing_count),
    cash_balance: toNumber(value.cash_balance),
    drawer_counted: toNullableNumber(value.drawer_counted),
    trend: value.trend.map((point) => {
      const row = asRecord(point)
      return { date: String(row.date), revenue: toNumber(row.revenue) }
    }),
    closing: {
      is_closed: closing.is_closed === true,
      username: typeof closing.username === 'string' ? closing.username : null,
      closed_at: typeof closing.closed_at === 'string' ? closing.closed_at : null,
      expected_cash: toNullableNumber(closing.expected_cash),
      counted_cash: toNullableNumber(closing.counted_cash),
      difference: toNullableNumber(closing.difference),
    },
    top_items: value.top_items.map((item) => {
      const row = asRecord(item)
      return {
        rank: toNumber(row.rank),
        menu_id: toNumber(row.menu_id),
        name: String(row.name ?? ''),
        category: String(row.category ?? ''),
        portions: toNumber(row.portions),
        revenue: toNumber(row.revenue),
      }
    }),
    top_items_revenue: toNumber(value.top_items_revenue),
    top_items_portions: toNumber(value.top_items_portions),
    unavailable_count: toNumber(value.unavailable_count),
    unavailable_items: Array.isArray(value.unavailable_items) ? value.unavailable_items.map((item) => {
      const row = asRecord(item)
      return { menu_id: toNumber(row.menu_id), name: String(row.name ?? '') }
    }) : [],
    void_count: toNumber(value.void_count),
    void_items: Array.isArray(value.void_items) ? value.void_items.map((item) => {
      const row = asRecord(item)
      return {
        transaction_id: toNumber(row.transaction_id),
        order_no: toNumber(row.order_no),
        total: toNumber(row.total),
        void_reason: typeof row.void_reason === 'string' ? row.void_reason : null,
        voided_at: typeof row.voided_at === 'string' ? row.voided_at : null,
      }
    }) : [],
    operational_issue_count: toNumber(value.operational_issue_count),
  }
}
