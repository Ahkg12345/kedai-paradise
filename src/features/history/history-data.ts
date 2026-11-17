import { formatInTimeZone } from 'date-fns-tz'
import type { UserRole } from '@/types/session'
import { supabase } from '@/lib/supabase/client'
import { id } from '@/lib/i18n/id'

export type PaymentMethod = 'cash' | 'qris'
export type TransactionStatus = 'processing' | 'completed' | 'void'
export type HistorySortField = 'order_no' | 'date' | 'table_no' | 'method' | 'total' | 'status' | 'duration_seconds' | 'total_cost' | 'gross_profit' | 'username'

export type HistoryFilters = {
  startDate: string
  endDate: string
  method: 'all' | PaymentMethod
  status: 'all' | TransactionStatus
}

export type HistorySort = {
  field: HistorySortField
  ascending: boolean
}

export type HistoryRow = {
  transaction_id: number
  order_no: number
  date: string
  order_date: string
  table_no: string
  method: PaymentMethod
  total: number
  status: TransactionStatus
  completed_at: string | null
  duration_seconds: number | null
  user_id: number
  username: string
  total_cost?: number
  gross_profit?: number
  void_reason: string | null
  voided_at: string | null
  voided_by?: number | null
  voided_by_username?: string | null
  user_role?: UserRole
}

export type HistoryDetailItem = {
  order_id: number
  name: string
  quantity: number
  subtotal: number
  note: string | null
  modifiers: string[]
}

export type HistoryDetails = { items: HistoryDetailItem[] }

export type HistoryPageResult = {
  rows: HistoryRow[]
  count: number
}

export function currentWibDate() {
  return formatInTimeZone(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd')
}

export function initialHistoryFilters(role: UserRole = 'admin'): HistoryFilters {
  const today = currentWibDate()
  return { startDate: role === 'cashier' ? today : `${today.slice(0, 7)}-01`, endDate: today, method: 'all', status: 'all' }
}

export async function fetchHistoryPage({
  role,
  filters,
  sort,
  page,
  pageSize = 50,
}: {
  role: UserRole
  filters: HistoryFilters
  sort: HistorySort
  page: number
  pageSize?: number
}): Promise<HistoryPageResult> {
  const start = (page - 1) * pageSize
  if (role === 'cashier') {
    let query = supabase
      .from('cashier_today_transaction_history')
      .select('transaction_id,order_no,date,order_date,table_no,method,total,status,completed_at,duration_seconds,user_id,username,void_reason,voided_at', { count: 'exact' })
      .order(sort.field as 'date', { ascending: sort.ascending })
      .order('transaction_id', { ascending: false })
      .range(start, start + pageSize - 1)

    if (filters.method !== 'all') query = query.eq('method', filters.method)
    if (filters.status !== 'all') query = query.eq('status', filters.status)

    const { data, error, count } = await query
    if (error) throw error
    return { rows: (data ?? []) as unknown as HistoryRow[], count: count ?? 0 }
  }

  let query = supabase
    .from('admin_transaction_history')
    .select('transaction_id,order_no,date,order_date,table_no,method,total,status,completed_at,duration_seconds,total_cost,gross_profit,user_id,username,void_reason,voided_at,voided_by,voided_by_username', { count: 'exact' })
    .gte('order_date', filters.startDate)
    .lte('order_date', filters.endDate)
    .order(sort.field as 'date', { ascending: sort.ascending })
    .order('transaction_id', { ascending: false })
    .range(start, start + pageSize - 1)

  if (filters.method !== 'all') query = query.eq('method', filters.method)
  if (filters.status !== 'all') query = query.eq('status', filters.status)

  const { data, error, count } = await query
  if (error) throw error

  const rows = (data ?? []) as unknown as HistoryRow[]
  const userIds = [...new Set(rows.map((row) => row.user_id))]
  if (userIds.length === 0) return { rows, count: count ?? 0 }

  const { data: users, error: usersError } = await supabase
    .from('admin_user_directory')
    .select('user_id,role')
    .in('user_id', userIds)
  if (usersError) throw usersError
  const roles = new Map((users ?? []).map((user) => [Number(user.user_id), user.role as UserRole]))
  return { rows: rows.map((row) => ({ ...row, user_role: roles.get(row.user_id) })), count: count ?? 0 }
}

export async function fetchHistoryRow(transactionId: number): Promise<HistoryRow | null> {
  const { data, error } = await supabase
    .from('admin_transaction_history')
    .select('transaction_id,order_no,date,order_date,table_no,method,total,status,completed_at,duration_seconds,total_cost,gross_profit,user_id,username,void_reason,voided_at,voided_by,voided_by_username')
    .eq('transaction_id', transactionId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const row = data as unknown as HistoryRow
  const { data: userData, error: userError } = await supabase
    .from('admin_user_directory')
    .select('user_id,role')
    .eq('user_id', row.user_id)
    .maybeSingle()
  if (userError) throw userError
  return { ...row, user_role: userData?.role as UserRole | undefined }
}

export async function fetchHistoryDetails(transactionId: number): Promise<HistoryDetails> {
  const { data, error } = await supabase.rpc('get_order_history_details', { p_transaction_id: transactionId })
  if (error) throw error
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray((data as { items?: unknown }).items)) {
    throw new Error(id.history.transactionDetailsUnavailable)
  }
  return data as unknown as HistoryDetails
}

export type HistorySummary = {
  active_count: number
  void_count: number
  void_value: number
  revenue: number
  total_cost: number
  gross_profit: number
}

export async function fetchHistorySummary(filters: HistoryFilters): Promise<HistorySummary> {
  const { data, error } = await supabase.rpc('get_history_summary', {
    p_start_date: filters.startDate,
    p_end_date: filters.endDate,
    p_method: filters.method,
    p_status: filters.status,
  })
  if (error) throw error
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Ringkasan transaksi tidak tersedia.')
  const value = data as unknown as Record<keyof HistorySummary, unknown>
  return {
    active_count: Number(value.active_count) || 0,
    void_count: Number(value.void_count) || 0,
    void_value: Number(value.void_value) || 0,
    revenue: Number(value.revenue) || 0,
    total_cost: Number(value.total_cost) || 0,
    gross_profit: Number(value.gross_profit) || 0,
  }
}

export async function fetchAllHistory(role: UserRole, filters: HistoryFilters, sort: HistorySort): Promise<HistoryRow[]> {
  const pageSize = 1_000
  const rows: HistoryRow[] = []
  let page = 1
  let total = 0
  do {
    const result = await fetchHistoryPage({ role, filters, sort, page, pageSize })
    rows.push(...result.rows)
    total = result.count
    page += 1
  } while (rows.length < total)
  return rows
}
