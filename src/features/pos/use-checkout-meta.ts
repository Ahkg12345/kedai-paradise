import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

export type CheckoutMeta = {
  order_date: string
  next_order_no: number
  queue_count: number
}

export const checkoutMetaQueryKey = ['checkout-meta'] as const

async function fetchCheckoutMeta(): Promise<CheckoutMeta> {
  const { data, error } = await supabase.rpc('get_checkout_meta')
  if (error) throw error
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Checkout metadata is unavailable')
  }

  const value = data as Record<string, unknown>
  const orderDate = value.order_date
  const nextOrderNo = Number(value.next_order_no)
  const queueCount = Number(value.queue_count)

  if (
    typeof orderDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(orderDate) ||
    !Number.isSafeInteger(nextOrderNo) || nextOrderNo < 1 ||
    !Number.isSafeInteger(queueCount) || queueCount < 0
  ) {
    throw new Error('Checkout metadata is invalid')
  }

  return { order_date: orderDate, next_order_no: nextOrderNo, queue_count: queueCount }
}

export function useCheckoutMeta(enabled = true) {
  return useQuery({
    queryKey: checkoutMetaQueryKey,
    queryFn: fetchCheckoutMeta,
    enabled,
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  })
}
