import { supabase } from '@/lib/supabase/client'
import { id } from '@/lib/i18n/id'

export type CashClosingPreview = {
  closing_date: string
  cash_sales: number
  qris_sales: number
  void_count: number
  void_value: number
  processing_count: number
  closing: {
    closing_id: number
    opening_cash: number
    cash_out: number
    counted_cash: number
    note: string | null
    created_at: string
    stale: boolean
  } | null
}

export type CashClosingHistoryRow = {
  closing_id?: number
  closing_date: string
  username?: string
  opening_cash?: number
  cash_sales?: number
  cash_out?: number
  expected_cash: number
  counted_cash: number
  difference: number
  note?: string | null
  created_at?: string
  stale: boolean
}

export type SavedCashClosing = {
  closing_id: number
  closing_date: string
  opening_cash: number
  cash_sales: number
  cash_out: number
  expected_cash: number
  counted_cash: number
  difference: number
  note: string | null
  username: string
  created_at: string
}

export type CashClosingReport = {
  business_name: string
  closing_id: number
  closing_date: string
  opening_cash: number
  cash_sales: number
  cash_out: number
  expected_cash: number
  counted_cash: number
  difference: number
  note: string | null
  username: string
  printed_at: string
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(id.cashClosing.loadError)
  }
  return value as Record<string, unknown>
}

function toNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function fetchCashClosingPreview(closingDate: string): Promise<CashClosingPreview> {
  const { data, error } = await supabase.rpc('get_cash_closing_preview', { p_closing_date: closingDate })
  if (error) throw error
  const value = asRecord(data)
  const existing = value.closing === null ? null : asRecord(value.closing)
  if (typeof value.closing_date !== 'string') throw new Error(id.cashClosing.loadError)

  return {
    closing_date: value.closing_date,
    cash_sales: toNumber(value.cash_sales),
    qris_sales: toNumber(value.qris_sales),
    void_count: toNumber(value.void_count),
    void_value: toNumber(value.void_value),
    processing_count: toNumber(value.processing_count),
    closing: existing ? {
      closing_id: toNumber(existing.closing_id),
      opening_cash: toNumber(existing.opening_cash),
      cash_out: toNumber(existing.cash_out),
      counted_cash: toNumber(existing.counted_cash),
      note: typeof existing.note === 'string' ? existing.note : null,
      created_at: String(existing.created_at ?? ''),
      stale: existing.stale === true,
    } : null,
  }
}

export async function fetchCashClosingHistory(): Promise<CashClosingHistoryRow[]> {
  const { data, error } = await supabase.rpc('get_cash_closing_history')
  if (error) throw error
  if (!Array.isArray(data)) throw new Error(id.cashClosing.loadError)

  return data.map((item) => {
    const value = asRecord(item)
    return {
      closing_id: value.closing_id === undefined ? undefined : toNumber(value.closing_id),
      closing_date: String(value.closing_date ?? ''),
      username: typeof value.username === 'string' ? value.username : undefined,
      opening_cash: value.opening_cash === undefined ? undefined : toNumber(value.opening_cash),
      cash_sales: value.cash_sales === undefined ? undefined : toNumber(value.cash_sales),
      cash_out: value.cash_out === undefined ? undefined : toNumber(value.cash_out),
      expected_cash: toNumber(value.expected_cash),
      counted_cash: toNumber(value.counted_cash),
      difference: toNumber(value.difference),
      note: typeof value.note === 'string' ? value.note : null,
      created_at: typeof value.created_at === 'string' ? value.created_at : undefined,
      stale: value.stale === true,
    }
  })
}

export async function saveCashClosing(input: {
  closingDate: string
  openingCash: number
  cashOut: number
  countedCash: number
  note: string
}): Promise<SavedCashClosing> {
  const { data, error } = await supabase.rpc('save_cash_closing', {
    p_closing_date: input.closingDate,
    p_opening_cash: input.openingCash,
    p_cash_out: input.cashOut,
    p_counted_cash: input.countedCash,
    p_note: input.note,
  })
  if (error) throw error
  const value = asRecord(data)

  return {
    closing_id: toNumber(value.closing_id),
    closing_date: String(value.closing_date ?? input.closingDate),
    opening_cash: toNumber(value.opening_cash),
    cash_sales: toNumber(value.cash_sales),
    cash_out: toNumber(value.cash_out),
    expected_cash: toNumber(value.expected_cash),
    counted_cash: toNumber(value.counted_cash),
    difference: toNumber(value.difference),
    note: typeof value.note === 'string' ? value.note : null,
    username: String(value.username ?? ''),
    created_at: String(value.created_at ?? ''),
  }
}

export async function fetchCashClosingReport(closingId: number): Promise<CashClosingReport> {
  const { data, error } = await supabase.rpc('get_cash_closing_report', { p_closing_id: closingId })
  if (error) throw error
  const value = asRecord(data)

  return {
    business_name: String(value.business_name ?? 'Kedai Paradise'),
    closing_id: toNumber(value.closing_id),
    closing_date: String(value.closing_date ?? ''),
    opening_cash: toNumber(value.opening_cash),
    cash_sales: toNumber(value.cash_sales),
    cash_out: toNumber(value.cash_out),
    expected_cash: toNumber(value.expected_cash),
    counted_cash: toNumber(value.counted_cash),
    difference: toNumber(value.difference),
    note: typeof value.note === 'string' ? value.note : null,
    username: String(value.username ?? ''),
    printed_at: String(value.printed_at ?? ''),
  }
}
