import { fromZonedTime } from 'date-fns-tz'
import { z } from 'zod'
import { id } from '@/lib/i18n/id'
import { supabase } from '@/lib/supabase/client'

export const FINANCE_PAGE_SIZE = 50
export const FINANCE_QUERY_KEY = ['finance-ledger'] as const
const WIB_TIME_ZONE = 'Asia/Jakarta'

export type FinanceType = 'income' | 'expense'
export type FinancePool = 'restock' | 'operating' | 'profit'
export type FinanceFilters = {
  startDate: string
  endDate: string
  type: 'all' | FinanceType
  pool: 'all' | FinancePool
}

export type FinanceRecord = {
  finance_id: number
  date: string
  type: FinanceType
  category: string
  pool: FinancePool
  amount: number
  description: string | null
  user_id: number
  username: string
}

export type FinancePageResult = {
  rows: FinanceRecord[]
  count: number
  total_expense: number
  total_income: number
  net: number
  categories: string[]
}

export const financeEntrySchema = z.object({
  date: z.string()
    .min(1, id.finance.validation.dateRequired)
    .refine((value) => {
      if (!value) return true
      const date = fromZonedTime(value, WIB_TIME_ZONE)
      return Number.isFinite(date.getTime()) && date <= new Date()
    }, id.finance.validation.dateInvalidOrFuture)
    .transform((value) => fromZonedTime(value, WIB_TIME_ZONE).toISOString()),
  type: z.enum(['expense', 'income']),
  category: z.string()
    .trim()
    .min(1, id.finance.validation.categoryRequired)
    .max(100, id.finance.validation.categoryLimit),
  pool: z.enum(['restock', 'operating', 'profit']),
  amount: z.string()
    .trim()
    .min(1, id.finance.validation.amountRequired)
    .transform((value) => Number(value.replace(/\D/g, '')))
    .pipe(z.number().int().positive(id.finance.validation.amountInvalid).max(2_147_483_647, id.finance.validation.amountInvalid)),
  description: z.string().trim().max(200, id.finance.validation.descriptionLimit),
})

export type FinanceEntryPayload = z.infer<typeof financeEntrySchema>

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(id.finance.loadError)
  }
  return value as Record<string, unknown>
}

function asNumber(value: unknown, label: string): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) throw new Error(`${label} ${id.finance.loadError}`)
  return number
}

function parseFinanceRow(value: unknown): FinanceRecord {
  const row = asRecord(value)
  if (
    typeof row.date !== 'string' ||
    (row.type !== 'income' && row.type !== 'expense') ||
    typeof row.category !== 'string' ||
    (row.pool !== 'restock' && row.pool !== 'operating' && row.pool !== 'profit') ||
    typeof row.username !== 'string' ||
    (row.description !== null && typeof row.description !== 'string')
  ) {
    throw new Error(id.finance.loadError)
  }

  return {
    finance_id: asNumber(row.finance_id, 'ID'),
    date: row.date,
    type: row.type,
    category: row.category,
    pool: row.pool,
    amount: asNumber(row.amount, 'Nominal'),
    description: row.description,
    user_id: asNumber(row.user_id, 'ID pengguna'),
    username: row.username,
  }
}

function parseFinancePage(value: unknown): FinancePageResult {
  const data = asRecord(value)
  if (!Array.isArray(data.rows) || !Array.isArray(data.categories)) {
    throw new Error(id.finance.loadError)
  }

  return {
    rows: data.rows.map(parseFinanceRow),
    count: asNumber(data.count, 'Jumlah catatan'),
    total_expense: asNumber(data.total_expense, 'Total pengeluaran'),
    total_income: asNumber(data.total_income, 'Total pemasukan'),
    net: asNumber(data.net, 'Saldo bersih'),
    categories: data.categories.filter((item): item is string => typeof item === 'string'),
  }
}

export async function fetchFinancePage(filters: FinanceFilters, page: number): Promise<FinancePageResult> {
  const { data, error } = await supabase.rpc('admin_finance_list', {
    p_start_date: filters.startDate,
    p_end_date: filters.endDate,
    p_type: filters.type,
    p_pool: filters.pool,
    p_page: page,
    p_page_size: FINANCE_PAGE_SIZE,
  })
  if (error) throw error
  return parseFinancePage(data)
}

export async function fetchAllFinance(filters: FinanceFilters): Promise<FinanceRecord[]> {
  const rows: FinanceRecord[] = []
  let page = 1
  let total = 0

  do {
    const result = await fetchFinancePage(filters, page)
    rows.push(...result.rows)
    total = result.count
    page += 1
  } while (rows.length < total)

  return rows
}

export async function createFinanceRecord(payload: FinanceEntryPayload): Promise<number> {
  const { data, error } = await supabase.rpc('admin_finance_create', {
    p_date: payload.date,
    p_type: payload.type,
    p_category: payload.category,
    p_pool: payload.pool,
    p_amount: payload.amount,
    p_description: payload.description || null,
  })
  if (error) throw error
  return asNumber(data, 'ID catatan')
}

export async function updateFinanceRecord(financeId: number, payload: FinanceEntryPayload): Promise<number> {
  const { data, error } = await supabase.rpc('admin_finance_update', {
    p_finance_id: financeId,
    p_date: payload.date,
    p_type: payload.type,
    p_category: payload.category,
    p_pool: payload.pool,
    p_amount: payload.amount,
    p_description: payload.description || null,
  })
  if (error) throw error
  return asNumber(data, 'ID catatan')
}

export async function deleteFinanceRecord(financeId: number): Promise<void> {
  const { error } = await supabase.rpc('admin_finance_delete', { p_finance_id: financeId })
  if (error) throw error
}
