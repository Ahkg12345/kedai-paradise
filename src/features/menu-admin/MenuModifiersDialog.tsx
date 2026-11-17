import { useState, type FormEvent } from 'react'
import { Plus, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { formatRupiah } from '@/lib/format'
import { id } from '@/lib/i18n/id'
import type { MenuModifierGroup, MenuModifierPayload } from './menu-admin-data'
import { MenuConfirmDialog } from './MenuConfirmDialog'
import { MenuDialog } from './MenuDialog'

type ModifierItemDraft = {
  id?: number
  name: string
  extra_price: string
  extra_cost: string
  available: boolean
}

type ModifierGroupDraft = {
  id?: number
  name: string
  type: 'single' | 'multiple'
  is_required: boolean
  items: ModifierItemDraft[]
}

function makeDrafts(groups: MenuModifierGroup[]): ModifierGroupDraft[] {
  return groups.map((group) => ({
    id: group.group_id,
    name: group.name,
    type: group.type,
    is_required: group.is_required,
    items: group.items.map((item) => ({
      id: item.modifier_id,
      name: item.name,
      extra_price: String(item.extra_price),
      extra_cost: String(item.extra_cost),
      available: item.available,
    })),
  }))
}

function parseWholeRupiah(value: string) {
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function MenuModifiersDialog({
  menuName,
  price,
  costPrice,
  groups: initialGroups,
  onClose,
  onSave,
}: {
  menuName: string
  price: number
  costPrice: number
  groups: MenuModifierGroup[]
  onClose: () => void
  onSave: (groups: MenuModifierPayload[]) => Promise<void>
}) {
  const [groups, setGroups] = useState(() => makeDrafts(initialGroups))
  const [pendingGroup, setPendingGroup] = useState<{ index: number; name: string } | null>(null)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const titleId = 'menu-modifiers-title'

  const updateGroup = (index: number, patch: Partial<ModifierGroupDraft>) => {
    setGroups((current) => current.map((group, groupIndex) => groupIndex === index ? { ...group, ...patch } : group))
  }

  const updateItem = (groupIndex: number, itemIndex: number, patch: Partial<ModifierItemDraft>) => {
    setGroups((current) => current.map((group, currentGroupIndex) => currentGroupIndex !== groupIndex ? group : {
      ...group,
      items: group.items.map((item, currentItemIndex) => currentItemIndex === itemIndex ? { ...item, ...patch } : item),
    }))
  }

  const addGroup = () => {
    if (groups.length >= 5) {
      setError(id.menuAdmin.maxGroups)
      return
    }
    setError('')
    setGroups((current) => [...current, { name: '', type: 'single', is_required: false, items: [] }])
  }

  const addItem = (groupIndex: number) => {
    if (groups[groupIndex].items.length >= 10) {
      setError(id.menuAdmin.maxItems)
      return
    }
    setError('')
    setGroups((current) => current.map((group, index) => index === groupIndex
      ? { ...group, items: [...group.items, { name: '', extra_price: '0', extra_cost: '0', available: true }] }
      : group))
  }

  const validate = (): MenuModifierPayload[] | null => {
    if (groups.length > 5) {
      setError(id.menuAdmin.maxGroups)
      return null
    }

    for (const group of groups) {
      if (!group.name.trim() || group.name.trim().length > 50) {
        setError(id.menuAdmin.groupNameRequired)
        return null
      }
      if (group.items.length > 10) {
        setError(id.menuAdmin.maxItems)
        return null
      }
      for (const item of group.items) {
        if (!item.name.trim() || item.name.trim().length > 50) {
          setError(id.menuAdmin.itemNameRequired)
          return null
        }
        if (parseWholeRupiah(item.extra_price) === null || parseWholeRupiah(item.extra_cost) === null) {
          setError(id.menuAdmin.invalidModifierPrice)
          return null
        }
      }
    }

    return groups.map((group) => ({
      ...(group.id ? { id: group.id } : {}),
      name: group.name.trim(),
      type: group.type,
      is_required: group.is_required,
      items: group.items.map((item) => ({
        ...(item.id ? { id: item.id } : {}),
        name: item.name.trim(),
        extra_price: parseWholeRupiah(item.extra_price) ?? 0,
        extra_cost: parseWholeRupiah(item.extra_cost) ?? 0,
        available: item.available,
      })),
    }))
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    const payload = validate()
    if (!payload) return
    setIsSaving(true)
    try {
      await onSave(payload)
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : id.errors.generic)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <MenuDialog labelledBy={titleId} className="menu-modifiers-dialog" onClose={onClose}>
      <form className="menu-modifiers-form" onSubmit={(event) => void handleSave(event)}>
        <header className="menu-dialog-header menu-modifiers-header">
          <span className="menu-dialog-icon"><SlidersHorizontal aria-hidden="true" /></span>
          <div className="menu-dialog-heading-copy">
            <h2 id={titleId}>{id.menuAdmin.modifierTitle.replace('{name}', menuName)}</h2>
            <span className="menu-base-price">{id.menuAdmin.basePrice.replace('{price}', formatRupiah(price)).replace('{cost}', formatRupiah(costPrice))}</span>
            <p>{id.menuAdmin.modifierDescription}</p>
          </div>
          <button type="button" className="menu-dialog-close" onClick={onClose} aria-label={id.menuAdmin.dialogClose}><X aria-hidden="true" /></button>
        </header>

        <div className="menu-modifier-limit">
          <span>{id.menuAdmin.modifierLimit}</span>
          <strong>{id.menuAdmin.groupUsed.replace('{count}', String(groups.length))}</strong>
        </div>

        <div className="menu-modifier-body">
          {groups.map((group, groupIndex) => (
            <section className="menu-modifier-group" key={group.id ?? `new-${groupIndex}`} aria-label={id.menuAdmin.groupLabel.replace('{number}', String(groupIndex + 1)).replace('{name}', group.name || id.menuAdmin.groupName)}>
              <header className="menu-modifier-group-heading">
                <span className="menu-group-number">{groupIndex + 1}</span>
                <div className="menu-group-name-wrap">
                  <label className="sr-only" htmlFor={`menu-group-name-${groupIndex}`}>{id.menuAdmin.groupName}</label>
                  <input id={`menu-group-name-${groupIndex}`} className="menu-group-name-input" value={group.name} onChange={(event) => updateGroup(groupIndex, { name: event.target.value })} maxLength={50} placeholder={id.menuAdmin.groupNamePlaceholder} required />
                  <small>{group.is_required ? id.menuAdmin.groupSubtitleRequired : id.menuAdmin.groupSubtitleOptional}</small>
                </div>
                <button type="button" className="menu-remove-group" onClick={() => setPendingGroup({ index: groupIndex, name: group.name || id.menuAdmin.groupName })}><Trash2 aria-hidden="true" />{id.menuAdmin.deleteGroup}</button>
              </header>

              <div className="menu-modifier-group-controls">
                <label className="menu-form-field">
                  <span>{id.menuAdmin.choiceType} <b aria-hidden="true">*</b></span>
                  <select value={group.type} onChange={(event) => updateGroup(groupIndex, { type: event.target.value as ModifierGroupDraft['type'] })}>
                    <option value="single">{id.menuAdmin.singleChoice}</option>
                    <option value="multiple">{id.menuAdmin.multipleChoice}</option>
                  </select>
                </label>
                <label className="menu-form-field">
                  <span>{id.menuAdmin.requirement} <b aria-hidden="true">*</b></span>
                  <select value={String(group.is_required)} onChange={(event) => updateGroup(groupIndex, { is_required: event.target.value === 'true' })}>
                    <option value="true">{id.menuAdmin.mandatory}</option>
                    <option value="false">{id.menuAdmin.optional}</option>
                  </select>
                </label>
              </div>

              <div className="menu-modifier-table-scroll">
                <table className="menu-modifier-table">
                  <thead><tr>
                    <th scope="col">{id.menuAdmin.itemName}</th>
                    <th scope="col">{id.menuAdmin.extraPrice}</th>
                    <th scope="col">{id.menuAdmin.extraCost}</th>
                    <th scope="col">{id.menuAdmin.itemAvailability}</th>
                    <th scope="col">{id.menuAdmin.actions}</th>
                  </tr></thead>
                  <tbody>
                    {group.items.map((item, itemIndex) => (
                      <tr key={item.id ?? `new-${itemIndex}`}>
                        <td><input aria-label={id.menuAdmin.itemName} value={item.name} onChange={(event) => updateItem(groupIndex, itemIndex, { name: event.target.value })} maxLength={50} required /></td>
                        <td><span className="menu-money-input"><span>Rp</span><input type="number" aria-label={`${id.menuAdmin.extraPrice} ${item.name}`} min="0" step="1" inputMode="numeric" value={item.extra_price} onChange={(event) => updateItem(groupIndex, itemIndex, { extra_price: event.target.value })} required /></span></td>
                        <td><span className="menu-money-input"><span>Rp</span><input type="number" aria-label={`${id.menuAdmin.extraCost} ${item.name}`} min="0" step="1" inputMode="numeric" value={item.extra_cost} onChange={(event) => updateItem(groupIndex, itemIndex, { extra_cost: event.target.value })} required /></span></td>
                        <td>
                          <label className={`menu-switch-label menu-modifier-switch${item.available ? ' is-available' : ' is-unavailable'}`}>
                            <input type="checkbox" role="switch" checked={item.available} onChange={(event) => updateItem(groupIndex, itemIndex, { available: event.target.checked })} aria-label={`${id.menuAdmin.itemAvailability}: ${item.name || id.menuAdmin.itemName}`} />
                            <span className="menu-switch-track" aria-hidden="true"><span /></span>
                            <span className="menu-switch-text">{item.available ? id.menuAdmin.available : id.menuAdmin.soldOut}</span>
                          </label>
                        </td>
                        <td><button type="button" className="menu-remove-item" onClick={() => updateGroup(groupIndex, { items: group.items.filter((_, index) => index !== itemIndex) })} aria-label={id.menuAdmin.deleteItem.replace('{name}', item.name || id.menuAdmin.itemName)}><Trash2 aria-hidden="true" /></button></td>
                      </tr>
                    ))}
                    {group.items.length === 0 && <tr><td colSpan={5} className="menu-modifier-empty">{id.menuAdmin.emptyChoices}</td></tr>}
                  </tbody>
                </table>
              </div>
              <button type="button" className="menu-add-item-button" onClick={() => addItem(groupIndex)} disabled={group.items.length >= 10}><Plus aria-hidden="true" />{id.menuAdmin.addItem}</button>
            </section>
          ))}
          {groups.length === 0 && <p className="menu-no-groups">{id.menuAdmin.noGroups}</p>}
          <button type="button" className="menu-add-group-button" onClick={addGroup} disabled={groups.length >= 5}><Plus aria-hidden="true" />{id.menuAdmin.addGroup}</button>
          {error && <p className="menu-form-error" role="alert">{error}</p>}
        </div>

        <footer className="menu-dialog-footer">
          <button type="button" className="menu-secondary-button" onClick={onClose} disabled={isSaving}>{id.menuAdmin.cancel}</button>
          <button type="submit" className="menu-primary-button" disabled={isSaving}>{isSaving ? id.menuAdmin.saving : id.menuAdmin.saveModifiers}</button>
        </footer>
      </form>
      </MenuDialog>
      {pendingGroup && (
        <MenuConfirmDialog
          title={id.menuAdmin.confirmDeleteGroupTitle}
          description={id.menuAdmin.confirmDeleteGroupMessage.replace('{name}', pendingGroup.name)}
          confirmLabel={id.menuAdmin.confirmDeleteAction}
          onClose={() => setPendingGroup(null)}
          onConfirm={async () => setGroups((current) => current.filter((_, index) => index !== pendingGroup.index))}
        />
      )}
    </>
  )
}
