export type QueueItem = {
  order_id: number
  name: string
  quantity: number
  modifiers: string[]
  note: string | null
}

export type QueueTicket = {
  transaction_id: number
  order_no: number
  date: string
  table_no: string
  items: QueueItem[]
  completed_at?: string | null
  duration_seconds?: number | null
  username?: string | null
}

export type QueuePayload = {
  active: QueueTicket[]
  completed: QueueTicket[]
  order_date: string
}
