import { supabase } from '@/lib/supabase/client'
import { id } from '@/lib/i18n/id'

export const REPORT_PAGE_SIZE = 50

export type ReportSummary = {
  revenue: number
  total_cost: number
  gross_profit: number
  net_profit: number
  gross_margin_pct: number
  net_margin_pct: number
  order_count: number
  cash_total: number
  qris_total: number
  void_count: number
  void_total: number
  manual_income: number
  manual_expense: number
  cash_balance: number
  reconciliation_matches: boolean
  pools: Array<{
    pool: 'restock' | 'operating' | 'profit'
    sales_allocation: number
    manual_income: number
    manual_expense: number
    balance: number
  }>
  business_name: string
}

export type DailyReportSortKey = 'date' | 'orders' | 'revenue' | 'cost' | 'gross_profit' | 'net_profit'
export type MenuPerformanceSortKey = 'name' | 'portions' | 'base_sales' | 'option_sales' | 'revenue' | 'gross_profit'
export type ReportSort<T extends string> = { key: T; direction: 'asc' | 'desc' }

export type DailyReportRow = {
  report_date: string
  order_count: number
  revenue: number
  total_cost: number
  gross_profit: number
  net_profit: number
}

export type DailyReportPage = { rows: DailyReportRow[]; count: number; page: number; page_size: number }

export type MenuPerformanceRow = {
  menu_id: number
  name: string
  category: string
  portions: number
  base_sales: number
  option_sales: number
  revenue: number
  gross_profit: number
  margin_pct: number
  top_modifier_name: string | null
  top_modifier_revenue: number
}

export type MenuPerformanceTotals = {
  portions: number
  base_sales: number
  option_sales: number
  revenue: number
  gross_profit: number
  base_share_pct: number
  option_share_pct: number
  margin_pct: number
}

export type MenuPerformancePage = {
  rows: MenuPerformanceRow[]
  count: number
  page: number
  page_size: number
  totals: MenuPerformanceTotals
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(id.reporting.loadError)
  return value as Record<string, unknown>
}

function asNumber(value: unknown, field: string): number {
  const result = Number(value)
  if (!Number.isSafeInteger(result)) throw new Error(`${field}: ${id.reporting.loadError}`)
  return result
}

function asPercent(value: unknown, field: string): number {
  const result = Number(value)
  if (!Number.isFinite(result)) throw new Error(`${field}: ${id.reporting.loadError}`)
  return result
}

function parseSummary(value: unknown): ReportSummary {
  const data = asRecord(value)
  if (!Array.isArray(data.pools) || typeof data.reconciliation_matches !== 'boolean') {
    throw new Error(id.reporting.loadError)
  }

  const pools = data.pools.map((value) => {
    const pool = asRecord(value)
    const poolType = pool.pool
    if (poolType !== 'restock' && poolType !== 'operating' && poolType !== 'profit') {
      throw new Error(id.reporting.loadError)
    }
    return {
      pool: poolType as ReportSummary['pools'][number]['pool'],
      sales_allocation: asNumber(pool.sales_allocation, id.reporting.poolAllocation),
      manual_income: asNumber(pool.manual_income, id.reporting.manualIncome),
      manual_expense: asNumber(pool.manual_expense, id.reporting.manualExpense),
      balance: asNumber(pool.balance, id.reporting.poolBalance),
    }
  })

  return {
    revenue: asNumber(data.revenue, id.reporting.totalRevenue),
    total_cost: asNumber(data.total_cost, id.reporting.totalCost),
    gross_profit: asNumber(data.gross_profit, id.reporting.grossProfit),
    net_profit: asNumber(data.net_profit, id.reporting.netProfit),
    gross_margin_pct: asPercent(data.gross_margin_pct, id.reporting.grossMarginLabel),
    net_margin_pct: asPercent(data.net_margin_pct, id.reporting.netMarginLabel),
    order_count: asNumber(data.order_count, id.reporting.orderCount),
    cash_total: asNumber(data.cash_total, id.reporting.cashTotal),
    qris_total: asNumber(data.qris_total, id.reporting.qrisTotal),
    void_count: asNumber(data.void_count, id.reporting.voidCount),
    void_total: asNumber(data.void_total, id.reporting.voidTotal),
    manual_income: asNumber(data.manual_income, id.reporting.manualIncome),
    manual_expense: asNumber(data.manual_expense, id.reporting.manualExpense),
    cash_balance: asNumber(data.cash_balance, id.reporting.cashBalance),
    reconciliation_matches: data.reconciliation_matches,
    pools,
    business_name: typeof data.business_name === 'string' ? data.business_name : id.reporting.printBusiness,
  }
}

function parseDailyRow(value: unknown): DailyReportRow {
  const row = asRecord(value)
  if (typeof row.report_date !== 'string') throw new Error(id.reporting.loadError)
  return {
    report_date: row.report_date,
    order_count: asNumber(row.order_count, id.reporting.orderCount),
    revenue: asNumber(row.revenue, id.reporting.totalRevenue),
    total_cost: asNumber(row.total_cost, id.reporting.totalCost),
    gross_profit: asNumber(row.gross_profit, id.reporting.grossProfit),
    net_profit: asNumber(row.net_profit, id.reporting.netProfit),
  }
}

function parseDailyPage(value: unknown): DailyReportPage {
  const data = asRecord(value)
  if (!Array.isArray(data.rows)) throw new Error(id.reporting.loadError)
  return {
    rows: data.rows.map(parseDailyRow),
    count: asNumber(data.count, id.reporting.dailyCount),
    page: asNumber(data.page, id.reporting.page),
    page_size: asNumber(data.page_size, id.reporting.pageSize),
  }
}

function parseMenuRow(value: unknown): MenuPerformanceRow {
  const row = asRecord(value)
  if (typeof row.name !== 'string' || typeof row.category !== 'string') throw new Error(id.menuPerformance.loadError)
  if (row.top_modifier_name !== null && typeof row.top_modifier_name !== 'string') throw new Error(id.menuPerformance.loadError)
  return {
    menu_id: asNumber(row.menu_id, id.menuPerformance.menuCount),
    name: row.name,
    category: row.category,
    portions: asNumber(row.portions, id.menuPerformance.portions),
    base_sales: asNumber(row.base_sales, id.menuPerformance.baseSales),
    option_sales: asNumber(row.option_sales, id.menuPerformance.optionSales),
    revenue: asNumber(row.revenue, id.menuPerformance.totalRevenue),
    gross_profit: asNumber(row.gross_profit, id.menuPerformance.grossProfit),
    margin_pct: asPercent(row.margin_pct, id.menuPerformance.margin),
    top_modifier_name: row.top_modifier_name,
    top_modifier_revenue: asNumber(row.top_modifier_revenue, id.menuPerformance.optionSales),
  }
}

function parseMenuPage(value: unknown): MenuPerformancePage {
  const data = asRecord(value)
  if (!Array.isArray(data.rows)) throw new Error(id.menuPerformance.loadError)
  const totals = asRecord(data.totals)
  return {
    rows: data.rows.map(parseMenuRow),
    count: asNumber(data.count, id.menuPerformance.menuCount),
    page: asNumber(data.page, id.menuPerformance.page),
    page_size: asNumber(data.page_size, id.menuPerformance.pageSize),
    totals: {
      portions: asNumber(totals.portions, id.menuPerformance.portions),
      base_sales: asNumber(totals.base_sales, id.menuPerformance.baseSales),
      option_sales: asNumber(totals.option_sales, id.menuPerformance.optionSales),
      revenue: asNumber(totals.revenue, id.menuPerformance.totalRevenue),
      gross_profit: asNumber(totals.gross_profit, id.menuPerformance.grossProfit),
      base_share_pct: asPercent(totals.base_share_pct, id.menuPerformance.baseShare),
      option_share_pct: asPercent(totals.option_share_pct, id.menuPerformance.optionShare),
      margin_pct: asPercent(totals.margin_pct, id.menuPerformance.margin),
    },
  }
}

export async function fetchReportSummary(startDate: string, endDate: string): Promise<ReportSummary> {
  const { data, error } = await supabase.rpc('admin_sales_report_summary', {
    p_start_date: startDate,
    p_end_date: endDate,
  })
  if (error) throw error
  return parseSummary(data)
}

export async function fetchDailyReportPage(
  startDate: string,
  endDate: string,
  page: number,
  sort: ReportSort<DailyReportSortKey>,
): Promise<DailyReportPage> {
  const { data, error } = await supabase.rpc('admin_sales_report_daily', {
    p_start_date: startDate,
    p_end_date: endDate,
    p_page: page,
    p_page_size: REPORT_PAGE_SIZE,
    p_sort_key: sort.key,
    p_sort_direction: sort.direction,
  })
  if (error) throw error
  return parseDailyPage(data)
}

export async function fetchMenuPerformancePage(
  startDate: string,
  endDate: string,
  page: number,
  sort: ReportSort<MenuPerformanceSortKey>,
): Promise<MenuPerformancePage> {
  const { data, error } = await supabase.rpc('admin_menu_performance', {
    p_start_date: startDate,
    p_end_date: endDate,
    p_page: page,
    p_page_size: REPORT_PAGE_SIZE,
    p_sort_key: sort.key,
    p_sort_direction: sort.direction,
  })
  if (error) throw error
  return parseMenuPage(data)
}

export async function fetchAllDailyReport(
  startDate: string,
  endDate: string,
  sort: ReportSort<DailyReportSortKey>,
): Promise<DailyReportRow[]> {
  const rows: DailyReportRow[] = []
  let page = 1
  let count = 0
  do {
    const result = await fetchDailyReportPage(startDate, endDate, page, sort)
    rows.push(...result.rows)
    count = result.count
    page += 1
  } while (rows.length < count)
  return rows
}

export async function fetchAllMenuPerformance(
  startDate: string,
  endDate: string,
  sort: ReportSort<MenuPerformanceSortKey>,
): Promise<MenuPerformanceRow[]> {
  const rows: MenuPerformanceRow[] = []
  let page = 1
  let count = 0
  do {
    const result = await fetchMenuPerformancePage(startDate, endDate, page, sort)
    rows.push(...result.rows)
    count = result.count
    page += 1
  } while (rows.length < count)
  return rows
}
