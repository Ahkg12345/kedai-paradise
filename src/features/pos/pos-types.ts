export type MenuItem = {
  menu_id: number
  code: string
  name: string
  category: string
  price: number
  photo: string | null
  photoUrl: string | null
  available: boolean
  status: boolean
}

export type ModifierGroup = {
  group_id: number
  menu_id: number
  name: string
  type: 'single' | 'multiple'
  is_required: boolean
}

export type ModifierItem = {
  modifier_id: number
  group_id: number
  name: string
  extra_price: number
  available: boolean
  hint: string | null
}

export type CartLine = {
  key: string
  menu: MenuItem
  quantity: number
  modifiers: ModifierItem[]
  note: string
}

export type PaymentMethod = 'cash' | 'qris'
export type ServiceMode = 'dine-in' | 'take-away'

export function getUnitPrice(menu: MenuItem, modifiers: ModifierItem[]): number {
  return menu.price + modifiers.reduce((total, modifier) => total + modifier.extra_price, 0)
}

export function getLineSubtotal(line: CartLine): number {
  return getUnitPrice(line.menu, line.modifiers) * line.quantity
}
