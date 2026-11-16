import { useEffect, useMemo, useRef, useState } from 'react'
import { Flame, Minus, Plus, ShoppingCart, X } from 'lucide-react'
import { formatRupiah } from '@/lib/format'
import { id } from '@/lib/i18n/id'
import { getUnitPrice } from '@/features/pos/pos-types'
import type { CartLine, MenuItem, ModifierGroup, ModifierItem } from '@/features/pos/pos-types'

type PosOptionsDialogProps = {
  menu: MenuItem
  groups: ModifierGroup[]
  modifiers: ModifierItem[]
  initialLine: CartLine | null
  onClose: () => void
  onSave: (modifiers: ModifierItem[], quantity: number, note: string) => void
}

export function PosOptionsDialog({
  menu,
  groups,
  modifiers,
  initialLine,
  onClose,
  onSave,
}: PosOptionsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>(() => initialLine?.modifiers.map((item) => item.modifier_id) ?? [])
  const [quantity, setQuantity] = useState(initialLine?.quantity ?? 1)
  const [note, setNote] = useState(initialLine?.note ?? '')
  const selectedModifiers = useMemo(
    () => modifiers.filter((item) => selectedIds.includes(item.modifier_id)),
    [modifiers, selectedIds],
  )
  const missingGroup = groups.find((group) => {
    if (!group.is_required) return false
    return selectedModifiers.filter((item) => item.group_id === group.group_id).length === 0
  })
  const unitPrice = getUnitPrice(menu, selectedModifiers)
  const subtotal = unitPrice * quantity

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => {
      if (dialog?.open) dialog.close()
    }
  }, [])

  const toggleModifier = (group: ModifierGroup, item: ModifierItem) => {
    setSelectedIds((current) => {
      if (group.type === 'single') {
        if (current.includes(item.modifier_id)) return current
        return [...current.filter((idValue) => !modifiers.some((candidate) => candidate.modifier_id === idValue && candidate.group_id === group.group_id)), item.modifier_id]
      }
      return current.includes(item.modifier_id)
        ? current.filter((idValue) => idValue !== item.modifier_id)
        : [...current, item.modifier_id]
    })
  }

  const handleSave = () => {
    if (missingGroup) return
    onSave(selectedModifiers, quantity, note.trim())
  }

  return (
    <dialog
      className="pos-options-dialog"
      ref={dialogRef}
      aria-labelledby="pos-options-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
    >
      <div className="pos-options-content">
        <header className="pos-options-header">
          <div>
            <div className="pos-options-kicker">
              <span className="pos-customize-chip">{id.pos.optionsTitle}</span>
              <code>#{menu.code}</code>
            </div>
            <h2 id="pos-options-title">{menu.name}</h2>
            <p>{id.pos.basePrice} <strong>{formatRupiah(menu.price)}</strong></p>
          </div>
          <button className="pos-dialog-close" type="button" onClick={onClose} aria-label={id.pos.closeDialog}>
            <X size={21} aria-hidden="true" />
          </button>
        </header>

        <div className="pos-options-groups">
          {groups.map((group) => {
            const groupItems = modifiers.filter((item) => item.group_id === group.group_id)
            const selectedCount = selectedIds.filter((idValue) => groupItems.some((item) => item.modifier_id === idValue)).length
            const instruction = group.type === 'single'
              ? (group.is_required ? id.pos.requiredOne : id.pos.optionalOne)
              : (group.is_required ? id.pos.requiredMany : id.pos.optionalMany)

            return (
              <section className="pos-option-group" key={group.group_id} aria-labelledby={`modifier-group-${group.group_id}`}>
                <div className="pos-option-group-heading">
                  <div className="pos-option-group-title-wrap">
                    <h3 id={`modifier-group-${group.group_id}`}>{group.name}</h3>
                    <span className={`pos-group-type-chip${group.is_required ? ' is-required' : ''}`}>
                      {group.is_required ? id.pos.required : id.pos.optional}
                    </span>
                  </div>
                  <span className="pos-group-instruction">{instruction}</span>
                </div>
                <p className="pos-group-subtitle">{group.is_required ? id.pos.groupRequired : id.pos.groupOptional}</p>

                <div className="pos-option-list">
                  {groupItems.map((item, index) => {
                    const checked = selectedIds.includes(item.modifier_id)
                    const unavailable = !item.available && !checked
                    const Input = group.type === 'single' ? 'radio' : 'checkbox'
                    const flameCount = group.name === 'Tingkat Pedas' ? index + 1 : 0
                    return (
                      <label
                        className={`pos-option-row${checked ? ' is-selected' : ''}${!item.available ? ' is-unavailable' : ''}`}
                        key={item.modifier_id}
                      >
                        <input
                          type={Input}
                          name={`modifier-group-${group.group_id}`}
                          checked={checked}
                          disabled={unavailable}
                          onChange={() => toggleModifier(group, item)}
                        />
                        <span className="pos-option-name">{item.name} (+{formatRupiah(item.extra_price)})</span>
                        {flameCount > 0 && (
                          <span className="pos-flame-icons" aria-label={`${flameCount} ${id.pos.spiceLevel}`}>
                            {Array.from({ length: flameCount }, (_, flameIndex) => (
                              <Flame key={flameIndex} size={16} aria-hidden="true" />
                            ))}
                          </span>
                        )}
                        {item.hint && <span className="pos-option-hint">{item.hint}</span>}
                        {!item.available && <span className="pos-unavailable-chip">{id.pos.soldOut}</span>}
                      </label>
                    )
                  })}
                </div>
                {group.is_required && selectedCount === 0 && (
                  <p className="pos-required-hint">{id.pos.requiredChoice.replace('{group}', group.name)}</p>
                )}
              </section>
            )
          })}
        </div>

        <div className="pos-note-field">
          <label htmlFor="pos-special-note">{id.pos.specialNote}</label>
          <span className="pos-note-limit">{id.pos.maxCharacters}</span>
          <input
            id="pos-special-note"
            type="text"
            maxLength={50}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={id.pos.notePlaceholder}
          />
        </div>

        <div className="pos-options-summary">
          <div className="pos-quantity-control" aria-label={id.pos.quantity}>
            <button type="button" onClick={() => setQuantity((current) => Math.max(1, current - 1))} disabled={quantity <= 1} aria-label={id.pos.decreaseQuantity}>
              <Minus size={17} aria-hidden="true" />
            </button>
            <output aria-live="polite">{quantity}</output>
            <button type="button" onClick={() => setQuantity((current) => current + 1)} aria-label={id.pos.increaseQuantity}>
              <Plus size={17} aria-hidden="true" />
            </button>
          </div>
          <div className="pos-options-price-summary">
            <span>{id.pos.unitPrice} {formatRupiah(unitPrice)}</span>
            <strong>{id.pos.subtotal}: {formatRupiah(subtotal)}</strong>
          </div>
        </div>

        <footer className="pos-options-actions">
          <button className="pos-options-cancel" type="button" onClick={onClose}>{id.pos.cancel}</button>
          <button className="pos-options-submit" type="button" onClick={handleSave} disabled={Boolean(missingGroup)}>
            <ShoppingCart size={19} aria-hidden="true" />
            <span>{initialLine ? id.pos.saveOptions : id.pos.addToOrder} ({formatRupiah(subtotal)})</span>
          </button>
        </footer>
      </div>
    </dialog>
  )
}
