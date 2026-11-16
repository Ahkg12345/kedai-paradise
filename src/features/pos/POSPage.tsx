import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import packageMetadata from '../../../package.json'
import { useSession } from '@/app/session-context'
import { PosCatalog } from '@/features/pos/PosCatalog'
import { PosOptionsDialog } from '@/features/pos/PosOptionsDialog'
import { PosOrderPanel } from '@/features/pos/PosOrderPanel'
import { usePosData } from '@/features/pos/use-pos-data'
import { id } from '@/lib/i18n/id'
import { supabase } from '@/lib/supabase/client'
import type { CartLine, MenuItem, ModifierItem, PaymentMethod, ServiceMode } from '@/features/pos/pos-types'
import './pos.css'

function sameModifiers(first: ModifierItem[], second: ModifierItem[]): boolean {
  const firstIds = first.map((item) => item.modifier_id).sort((a, b) => a - b)
  const secondIds = second.map((item) => item.modifier_id).sort((a, b) => a - b)
  return firstIds.length === secondIds.length && firstIds.every((idValue, index) => idValue === secondIds[index])
}

export function POSPage() {
  const { user } = useSession()
  const role = user?.role ?? 'cashier'
  const queryClient = useQueryClient()
  const { data, isPending, isError, refetch, isFetching } = usePosData(role)
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [selectedMenu, setSelectedMenu] = useState<MenuItem | null>(null)
  const [editingLine, setEditingLine] = useState<CartLine | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [cashReceived, setCashReceived] = useState('')
  const [serviceMode, setServiceMode] = useState<ServiceMode>('dine-in')
  const [tableNo, setTableNo] = useState<number | 'TA'>(1)
  const [announcement, setAnnouncement] = useState('')

  const availabilityMutation = useMutation({
    mutationFn: async ({ menuId, available }: { menuId: number; available: boolean }) => {
      const { error } = await supabase.rpc('set_menu_available', {
        p_menu_id: menuId,
        p_available: available,
      })
      if (error) throw error
    },
    onSuccess: (_result, variables) => {
      const item = data?.menu.find((menuItem) => menuItem.menu_id === variables.menuId)
      setAnnouncement(item ? id.pos.availabilityUpdated.replace('{name}', item.name) : id.errors.generic)
      void queryClient.invalidateQueries({ queryKey: ['pos-data', role] })
    },
    onError: () => setAnnouncement(id.errors.generic),
  })

  const addOrUpdateLine = (
    menu: MenuItem,
    modifiers: ModifierItem[],
    quantity: number,
    note: string,
    existingKey?: string,
  ) => {
    const normalizedNote = note.trim()
    setCart((previous) => {
      const mergeTarget = previous.find((line) =>
        line.key !== existingKey &&
        line.menu.menu_id === menu.menu_id &&
        line.note === normalizedNote &&
        sameModifiers(line.modifiers, modifiers),
      )

      if (mergeTarget) {
        return previous
          .filter((line) => line.key !== existingKey && line.key !== mergeTarget.key)
          .concat({ ...mergeTarget, quantity: mergeTarget.quantity + quantity })
      }

      if (existingKey) {
        return previous.map((line) => line.key === existingKey
          ? { ...line, menu, modifiers, quantity, note: normalizedNote }
          : line)
      }

      return [...previous, {
        key: crypto.randomUUID(),
        menu,
        modifiers,
        quantity,
        note: normalizedNote,
      }]
    })
  }

  const handleSelectMenu = (menu: MenuItem) => {
    const groups = data?.groups.filter((group) => group.menu_id === menu.menu_id) ?? []
    if (groups.length > 0) {
      setEditingLine(null)
      setSelectedMenu(menu)
      return
    }

    addOrUpdateLine(menu, [], 1, '')
    setAnnouncement(id.pos.itemAdded.replace('{name}', menu.name))
  }

  const handleEditLine = (line: CartLine) => {
    setEditingLine(line)
    setSelectedMenu(line.menu)
  }

  const handleSaveOptions = (modifiers: ModifierItem[], quantity: number, note: string) => {
    if (!selectedMenu) return
    addOrUpdateLine(selectedMenu, modifiers, quantity, note, editingLine?.key)
    setAnnouncement(editingLine ? id.pos.optionsUpdated : id.pos.itemAdded.replace('{name}', selectedMenu.name))
    setSelectedMenu(null)
    setEditingLine(null)
  }

  const closeOptions = () => {
    setSelectedMenu(null)
    setEditingLine(null)
  }

  const updateQuantity = (key: string, quantity: number) => {
    if (quantity < 1) return
    setCart((previous) => previous.map((line) => line.key === key ? { ...line, quantity } : line))
  }

  const quantityCount = cart.reduce((total, line) => total + line.quantity, 0)
  const total = cart.reduce((sum, line) => sum + (line.menu.price + line.modifiers.reduce((modifierTotal, item) => modifierTotal + item.extra_price, 0)) * line.quantity, 0)
  const groupsForMenu = selectedMenu ? data?.groups.filter((group) => group.menu_id === selectedMenu.menu_id) ?? [] : []
  const modifiersForMenu = groupsForMenu.length > 0
    ? data?.modifiers.filter((item) => groupsForMenu.some((group) => group.group_id === item.group_id)) ?? []
    : []

  return (
    <div className="pos-page">
      {isPending ? (
        <div className="pos-page-state" role="status" aria-busy="true">{id.pos.loadingMenu}</div>
      ) : isError ? (
        <div className="pos-page-state is-error" role="alert">
          <p>{id.pos.loadError}</p>
          <button type="button" onClick={() => void refetch()} disabled={isFetching}>{id.pos.retry}</button>
        </div>
      ) : (
        <div className="pos-layout">
          <PosCatalog
            menu={data?.menu ?? []}
            category={category}
            search={search}
            pendingMenuId={availabilityMutation.isPending ? availabilityMutation.variables?.menuId ?? null : null}
            hasModifiers={(menuId) => data?.groups.some((group) => group.menu_id === menuId) ?? false}
            onCategoryChange={setCategory}
            onSearchChange={setSearch}
            onSelectMenu={handleSelectMenu}
            onToggleAvailability={(item) => availabilityMutation.mutate({ menuId: item.menu_id, available: !item.available })}
          />
          <PosOrderPanel
            lines={cart}
            total={total}
            quantityCount={quantityCount}
            tableCount={data?.tableCount ?? 1}
            serviceMode={serviceMode}
            tableNo={tableNo}
            paymentMethod={paymentMethod}
            cashReceived={cashReceived}
            onServiceModeChange={(mode) => {
              setServiceMode(mode)
              setTableNo(mode === 'take-away' ? 'TA' : 1)
            }}
            onTableChange={setTableNo}
            onPaymentMethodChange={setPaymentMethod}
            onCashReceivedChange={setCashReceived}
            onSetCashReceived={(amount) => setCashReceived(String(amount))}
            onClearCart={() => {
              setCart([])
              setCashReceived('')
            }}
            onRemove={(key) => setCart((previous) => previous.filter((line) => line.key !== key))}
            onQuantityChange={updateQuantity}
            onEdit={handleEditLine}
          />
        </div>
      )}

      <footer className="pos-footer">
        <span>{id.pos.versionLabel} {packageMetadata.version} {id.pos.stableVersion}</span>
        <span>{id.pos.copyright}</span>
      </footer>

      <p className="sr-only" aria-live="polite">{announcement}</p>

      {selectedMenu && (
        <PosOptionsDialog
          key={`${selectedMenu.menu_id}-${editingLine?.key ?? 'new'}`}
          menu={selectedMenu}
          groups={groupsForMenu}
          modifiers={modifiersForMenu}
          initialLine={editingLine}
          onClose={closeOptions}
          onSave={handleSaveOptions}
        />
      )}
    </div>
  )
}
