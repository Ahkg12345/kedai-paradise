import { supabase } from '@/lib/supabase/client'

export type MenuAdminSummary = {
  total_count: number
  total_active: number
  avg_margin_pct: number
  critical_count: number
  variant_count: number
  categories: string[]
  deletable_menu_ids: number[]
}

export type MenuModifierItem = {
  modifier_id: number
  group_id: number
  name: string
  extra_price: number
  extra_cost: number
  available: boolean
  hint: string | null
}

export type MenuModifierGroup = {
  group_id: number
  menu_id: number
  name: string
  type: 'single' | 'multiple'
  is_required: boolean
  items: MenuModifierItem[]
}

export type MenuRecord = {
  menu_id: number
  code: string
  name: string
  category: string
  price: number
  cost_price: number
  photo: string | null
  photoUrl: string | null
  available: boolean
  status: boolean
  groups: MenuModifierGroup[]
}

export type MenuPage = {
  rows: MenuRecord[]
  count: number
}

export type MenuPageFilters = {
  search: string
  category: string
  showInactive: boolean
  page: number
  pageSize: number
}

export type MenuSavePayload = {
  menu_id: number | null
  name: string
  category: string
  price: number
  cost_price: number
  photo: string | null
  available: boolean
  status: boolean
}

export type MenuModifierPayload = {
  id?: number
  name: string
  type: 'single' | 'multiple'
  is_required: boolean
  items: Array<{
    id?: number
    name: string
    extra_price: number
    extra_cost: number
    available: boolean
  }>
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Ringkasan menu belum dapat dimuat.')
  }
  return value as Record<string, unknown>
}

function asNumber(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function asRows<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

export async function fetchMenuAdminSummary(): Promise<MenuAdminSummary> {
  const { data, error } = await supabase.rpc('admin_menu_summary')
  if (error) throw error

  const summary = asRecord(data)
  return {
    total_count: asNumber(summary.total_count),
    total_active: asNumber(summary.total_active),
    avg_margin_pct: asNumber(summary.avg_margin_pct),
    critical_count: asNumber(summary.critical_count),
    variant_count: asNumber(summary.variant_count),
    categories: asRows<unknown>(summary.categories).filter((category): category is string => typeof category === 'string'),
    deletable_menu_ids: asRows<unknown>(summary.deletable_menu_ids)
      .map(asNumber)
      .filter((menuId) => Number.isSafeInteger(menuId) && menuId > 0),
  }
}

export async function fetchMenuAdminPage(filters: MenuPageFilters): Promise<MenuPage> {
  let menuQuery = supabase
    .from('admin_menu_records')
    .select('menu_id, code, name, category, price, cost_price, photo, available, status', { count: 'exact' })

  if (!filters.showInactive) menuQuery = menuQuery.eq('status', true)
  if (filters.category) menuQuery = menuQuery.eq('category', filters.category)
  if (filters.search.trim()) menuQuery = menuQuery.ilike('name', `%${escapeLikePattern(filters.search.trim())}%`)

  const start = (filters.page - 1) * filters.pageSize
  const { data: menuData, error: menuError, count } = await menuQuery
    .order('menu_id', { ascending: true })
    .range(start, start + filters.pageSize - 1)

  if (menuError) throw menuError

  const menuRows = (menuData ?? []) as unknown as Omit<MenuRecord, 'photoUrl' | 'groups'>[]
  const menuIds = menuRows.map((item) => item.menu_id)
  if (menuIds.length === 0) return { rows: [], count: count ?? 0 }

  const { data: groupData, error: groupError } = await supabase
    .from('admin_modifier_groups')
    .select('group_id, menu_id, name, type, is_required')
    .in('menu_id', menuIds)
    .order('group_id', { ascending: true })
  if (groupError) throw groupError

  const groups = (groupData ?? []) as unknown as Omit<MenuModifierGroup, 'items'>[]
  const groupIds = groups.map((group) => group.group_id)
  let modifiers: MenuModifierItem[] = []

  if (groupIds.length > 0) {
    const { data: modifierData, error: modifierError } = await supabase
      .from('admin_modifier_items')
      .select('modifier_id, group_id, name, extra_price, extra_cost, available, hint')
      .in('group_id', groupIds)
      .order('modifier_id', { ascending: true })
    if (modifierError) throw modifierError
    modifiers = (modifierData ?? []) as unknown as MenuModifierItem[]
  }

  const groupsByMenu = new Map<number, MenuModifierGroup[]>()
  for (const group of groups) {
    const menuGroups = groupsByMenu.get(group.menu_id) ?? []
    menuGroups.push({ ...group, items: modifiers.filter((item) => item.group_id === group.group_id) })
    groupsByMenu.set(group.menu_id, menuGroups)
  }

  const rows = await Promise.all(menuRows.map(async (item): Promise<MenuRecord> => {
    let photoUrl: string | null = null
    if (item.photo) {
      const { data, error } = await supabase.storage.from('menu').createSignedUrl(item.photo, 3_600)
      if (!error) photoUrl = data.signedUrl
    }

    return {
      ...item,
      photoUrl,
      groups: groupsByMenu.get(item.menu_id) ?? [],
    }
  }))

  return { rows, count: count ?? 0 }
}

function getPhotoExtension(file: File) {
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/jpeg') return 'jpg'
  throw new Error('Foto harus berformat JPEG atau PNG.')
}

async function removeMenuPhoto(photo: string | null) {
  if (!photo || !/^menu\/[A-Za-z0-9._-]+$/.test(photo)) return
  await supabase.storage.from('menu').remove([photo])
}

export async function saveAdminMenu(payload: MenuSavePayload, file: File | null): Promise<number> {
  let photo = payload.photo
  let uploadedPhoto: string | null = null

  if (file) {
    if (file.size > 1_048_576) throw new Error('Ukuran foto maksimal 1 MB.')
    const extension = getPhotoExtension(file)
    uploadedPhoto = `menu/${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await supabase.storage.from('menu').upload(uploadedPhoto, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    })
    if (uploadError) throw uploadError
    photo = uploadedPhoto
  }

  const { data, error } = await supabase.rpc('admin_save_menu', {
    p_menu_id: payload.menu_id,
    p_name: payload.name,
    p_category: payload.category,
    p_price: payload.price,
    p_cost_price: payload.cost_price,
    p_photo: photo,
    p_available: payload.available,
    p_status: payload.status,
  })

  if (error) {
    if (uploadedPhoto) await removeMenuPhoto(uploadedPhoto)
    throw error
  }

  if (payload.photo && payload.photo !== photo) await removeMenuPhoto(payload.photo)
  return asNumber(data)
}

export async function deleteAdminMenu(menuId: number) {
  const { error } = await supabase.rpc('admin_delete_menu', { p_menu_id: menuId })
  if (error) throw error
}

export async function saveAdminMenuModifiers(menuId: number, groups: MenuModifierPayload[]) {
  const { error } = await supabase.rpc('admin_save_menu_modifiers', {
    p_menu_id: menuId,
    p_groups: groups,
  })
  if (error) throw error
}
