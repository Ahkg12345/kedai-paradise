import { useQuery } from '@tanstack/react-query'
import { id } from '@/lib/i18n/id'
import { supabase } from '@/lib/supabase/client'
import type { ModifierGroup, ModifierItem, MenuItem } from '@/features/pos/pos-types'
import type { UserRole } from '@/types/session'

type PosData = {
  menu: MenuItem[]
  groups: ModifierGroup[]
  modifiers: ModifierItem[]
  tableCount: number
}

type RawMenu = Omit<MenuItem, 'photoUrl'>

async function fetchPosData(role: UserRole): Promise<PosData> {
  const menuView = role === 'admin' ? 'admin_menu_records' : 'cashier_menu'
  const groupView = role === 'admin' ? 'admin_modifier_groups' : 'cashier_menu_modifier_groups'
  const modifierView = role === 'admin' ? 'admin_modifier_items' : 'cashier_menu_modifier_items'

  const [menuResult, groupResult, modifierResult, settingsResult] = await Promise.all([
    supabase
      .from(menuView)
      .select('menu_id, code, name, category, price, photo, available, status')
      .eq('status', true)
      .order('menu_id', { ascending: true }),
    supabase
      .from(groupView)
      .select('group_id, menu_id, name, type, is_required')
      .order('group_id', { ascending: true }),
    supabase
      .from(modifierView)
      .select('modifier_id, group_id, name, extra_price, available, hint')
      .order('modifier_id', { ascending: true }),
    supabase.from('cashier_settings').select('table_count').limit(1).maybeSingle(),
  ])

  if (menuResult.error || groupResult.error || modifierResult.error || settingsResult.error) {
    throw new Error(id.errors.generic)
  }

  const rawMenu = (menuResult.data ?? []) as unknown as RawMenu[]
  const groups = (groupResult.data ?? []) as unknown as ModifierGroup[]
  const modifiers = (modifierResult.data ?? []) as unknown as ModifierItem[]
  const settings = settingsResult.data as unknown as { table_count: number } | null

  const menu = await Promise.all(rawMenu.map(async (item) => {
    if (!item.photo) return { ...item, photoUrl: null }

    const { data, error } = await supabase.storage.from('menu').createSignedUrl(item.photo, 3_600)
    return { ...item, photoUrl: error ? null : data.signedUrl }
  }))

  return {
    menu,
    groups,
    modifiers,
    tableCount: Math.max(1, Number(settings?.table_count ?? 1)),
  }
}

export function usePosData(role: UserRole) {
  return useQuery({
    queryKey: ['pos-data', role],
    queryFn: () => fetchPosData(role),
    staleTime: 60_000,
  })
}
