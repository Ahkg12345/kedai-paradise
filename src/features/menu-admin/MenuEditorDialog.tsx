import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { ImagePlus, Pencil, Trash2, X } from 'lucide-react'
import { formatRupiahInput, formatSignedRupiah, parseRupiahInput } from '@/lib/format'
import { id } from '@/lib/i18n/id'
import type { MenuRecord, MenuSavePayload } from './menu-admin-data'
import { MenuConfirmDialog } from './MenuConfirmDialog'
import { MenuDialog } from './MenuDialog'
import { MenuMoneyInput } from './MenuMoneyInput'

function formatFileSize(bytes: number) {
  return bytes < 1_048_576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`
}

function getReadablePhotoName(menuName: string, path: string) {
  const extension = path.split('.').pop()?.match(/^[a-z0-9]{1,5}$/i)?.[0]
  return extension ? `${menuName}.${extension}` : menuName
}

function MenuToggle({
  checked,
  label,
  caption,
  onChange,
}: {
  checked: boolean
  label: string
  caption: string
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="menu-editor-toggle">
      <span className="menu-editor-toggle-copy"><strong>{label}</strong><small>{caption}</small></span>
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-label={label} />
      <span className="menu-switch-track" aria-hidden="true"><span /></span>
    </label>
  )
}

export function MenuEditorDialog({
  menu,
  categories,
  canDelete,
  onClose,
  onSave,
  onDelete,
}: {
  menu: MenuRecord | null
  categories: string[]
  canDelete: boolean
  onClose: () => void
  onSave: (payload: MenuSavePayload, file: File | null) => Promise<void>
  onDelete: (menu: MenuRecord) => Promise<void>
}) {
  const [name, setName] = useState(menu?.name ?? '')
  const [category, setCategory] = useState(menu?.category ?? id.menuAdmin.categories.food)
  const [price, setPrice] = useState(() => formatRupiahInput(String(menu?.price ?? '')).value)
  const [costPrice, setCostPrice] = useState(() => formatRupiahInput(String(menu?.cost_price ?? '')).value)
  const [photo, setPhoto] = useState(menu?.photo ?? null)
  const [file, setFile] = useState<File | null>(null)
  const [available, setAvailable] = useState(menu?.available ?? true)
  const [status, setStatus] = useState(menu?.status ?? true)
  const [isSaving, setIsSaving] = useState(false)
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)
  const [showDeactivateConfirmation, setShowDeactivateConfirmation] = useState(false)
  const [error, setError] = useState('')
  const [dimensions, setDimensions] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const titleId = 'menu-editor-title'
  const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : menu?.photoUrl ?? null, [file, menu?.photoUrl])
  const usedCategories = useMemo(() => [...new Set([
    ...categories,
    id.menuAdmin.categories.food,
    id.menuAdmin.categories.drink,
    id.menuAdmin.categories.snack,
  ])], [categories])
  const parsedPrice = parseRupiahInput(price)
  const parsedCost = parseRupiahInput(costPrice)
  const hasNegativeMargin = parsedPrice !== null && parsedCost !== null && parsedPrice < parsedCost

  useEffect(() => () => {
    if (file && previewUrl) URL.revokeObjectURL(previewUrl)
  }, [file, previewUrl])

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null
    event.target.value = ''
    setError('')
    setDimensions('')
    if (!selected) return
    if (selected.type !== 'image/jpeg' && selected.type !== 'image/png') {
      setError(id.menuAdmin.unsupportedPhoto)
      return
    }
    if (selected.size > 1_048_576) {
      setError(id.menuAdmin.oversizedPhoto)
      return
    }
    setFile(selected)
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    const normalizedName = name.trim()
    const normalizedCategory = category.trim()
    if (!normalizedName || normalizedName.length > 100) {
      setError(id.menuAdmin.nameRequired)
      return
    }
    if (!normalizedCategory || normalizedCategory.length > 30) {
      setError(id.menuAdmin.categoryRequired)
      return
    }
    if (parsedPrice === null || parsedCost === null) {
      setError(id.menuAdmin.invalidPrice)
      return
    }

    setIsSaving(true)
    try {
      await onSave({
        menu_id: menu?.menu_id ?? null,
        name: normalizedName,
        category: normalizedCategory,
        price: parsedPrice,
        cost_price: parsedCost,
        photo,
        available,
        status,
      }, file)
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : id.errors.generic)
    } finally {
      setIsSaving(false)
    }
  }

  const photoName = file?.name ?? (photo && menu ? getReadablePhotoName(menu.name, photo) : '')
  const photoSize = file?.size ?? menu?.photo_size ?? null
  const photoStatus = file ? id.menuAdmin.photoReady : photo ? id.menuAdmin.photoSaved : id.menuAdmin.photoMissing
  const canSubmit = !isSaving

  return (
    <>
      <MenuDialog labelledBy={titleId} className="menu-editor-dialog" onClose={onClose}>
      <form className="menu-editor-form" onSubmit={(event) => void handleSave(event)}>
        <header className="menu-dialog-header">
          <span className="menu-dialog-icon"><Pencil aria-hidden="true" /></span>
          <div className="menu-dialog-heading-copy">
            <h2 id={titleId}>{menu ? id.menuAdmin.editTitle : id.menuAdmin.addTitle}</h2>
            {menu && <span className="menu-dialog-sku">{id.menuAdmin.sku.replace('{code}', menu.code)}</span>}
          </div>
          <button type="button" className="menu-dialog-close" onClick={onClose} aria-label={id.menuAdmin.dialogClose}><X aria-hidden="true" /></button>
        </header>

        <div className="menu-editor-body">
          <div className="menu-editor-fields">
            <label className="menu-form-field">
              <span>{id.menuAdmin.name} <b aria-hidden="true">*</b></span>
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required autoFocus aria-invalid={Boolean(error && !name.trim())} />
              <small>{id.menuAdmin.required}</small>
            </label>
            <label className="menu-form-field">
              <span>{id.menuAdmin.category} <b aria-hidden="true">*</b></span>
              <input value={category} onChange={(event) => setCategory(event.target.value)} maxLength={30} required list="menu-admin-category-options" aria-invalid={Boolean(error && !category.trim())} />
              <datalist id="menu-admin-category-options">{usedCategories.map((value) => <option key={value} value={value} />)}</datalist>
              <small>{id.menuAdmin.maxCategory}</small>
              <span className="menu-category-recommendations">
                <strong>{id.menuAdmin.recommendations}</strong>
                {usedCategories.map((value) => <button type="button" key={value} onClick={() => setCategory(value)}>{value}</button>)}
              </span>
            </label>
          </div>

          <div className="menu-editor-fields">
            <label className="menu-form-field">
              <span>{id.menuAdmin.price} <b aria-hidden="true">*</b></span>
              <MenuMoneyInput value={price} onChange={setPrice} label={id.menuAdmin.price} />
              <small>{id.menuAdmin.priceHint}</small>
            </label>
            <label className="menu-form-field">
              <span>{id.menuAdmin.costPrice} <b aria-hidden="true">*</b></span>
              <MenuMoneyInput value={costPrice} onChange={setCostPrice} label={id.menuAdmin.costPrice} />
              <small>{id.menuAdmin.costHint}</small>
            </label>
          </div>

          {hasNegativeMargin && <p className="menu-negative-margin" role="status">{id.menuAdmin.negativeMargin.replace('{amount}', formatSignedRupiah(parsedPrice - parsedCost))}</p>}

          <fieldset className="menu-photo-fieldset">
            <legend>{id.menuAdmin.photo}</legend>
            <div className="menu-photo-row">
              {previewUrl ? (
                <img className="menu-photo-preview" src={previewUrl} alt={photoName || id.menuAdmin.photo} onLoad={(event) => setDimensions(`${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight}`)} />
              ) : <span className="menu-photo-preview menu-photo-preview-empty"><ImagePlus aria-hidden="true" /></span>}
              <div className="menu-photo-copy">
                {photoName && <strong>{photoName}</strong>}
                {photoSize !== null && <small>{formatFileSize(photoSize)}</small>}
                <span className={file ? 'is-ready' : photo ? 'is-saved' : ''}>{photoStatus}</span>
                {dimensions && <small className="menu-photo-dimensions">{id.menuAdmin.photoDimensions.replace('{dimensions}', dimensions)}</small>}
              </div>
              <div className="menu-photo-actions">
                <button type="button" className="menu-photo-change" onClick={() => fileInputRef.current?.click()}>{photo || file ? id.menuAdmin.replacePhoto : id.menuAdmin.choosePhoto}</button>
                {(photo || file) && <button type="button" className="menu-photo-remove" onClick={() => { setFile(null); setPhoto(null); setDimensions('') }} aria-label={id.menuAdmin.removePhoto}><Trash2 aria-hidden="true" /></button>}
                <input ref={fileInputRef} className="menu-visually-hidden-file" type="file" accept="image/jpeg,image/png" onChange={handleFileChange} aria-label={id.menuAdmin.selectPhoto} />
              </div>
            </div>
          </fieldset>

          <div className="menu-editor-toggles">
            <MenuToggle checked={available} label={id.menuAdmin.availableToggle} caption={id.menuAdmin.availableCaption} onChange={setAvailable} />
            <MenuToggle
              checked={status}
              label={id.menuAdmin.activeToggle}
              caption={id.menuAdmin.activeCaption}
              onChange={(nextStatus) => {
                if (menu?.status && !nextStatus) {
                  setShowDeactivateConfirmation(true)
                } else {
                  setStatus(nextStatus)
                }
              }}
            />
          </div>

          {error && <p className="menu-form-error" role="alert">{error}</p>}
        </div>

        <footer className="menu-dialog-footer">
          <button type="button" className="menu-secondary-button" onClick={onClose} disabled={!canSubmit}>{id.menuAdmin.cancel}</button>
          {menu && canDelete && <button type="button" className="menu-delete-button" onClick={() => setShowDeleteConfirmation(true)} disabled={!canSubmit}><Trash2 aria-hidden="true" />{id.menuAdmin.deleteMenu}</button>}
          <button type="submit" className="menu-primary-button" disabled={!canSubmit}>{isSaving ? id.menuAdmin.saving : id.menuAdmin.save}</button>
        </footer>
      </form>
      </MenuDialog>
      {showDeactivateConfirmation && menu && (
        <MenuConfirmDialog
          title={id.menuAdmin.confirmDeactivateTitle}
          description={id.menuAdmin.confirmDeactivateMessage.replace('{name}', menu.name)}
          confirmLabel={id.menuAdmin.confirmDeactivateAction}
          onClose={() => setShowDeactivateConfirmation(false)}
          onConfirm={async () => setStatus(false)}
        />
      )}
      {showDeleteConfirmation && menu && (
        <MenuConfirmDialog
          title={id.menuAdmin.confirmDeleteMenuTitle}
          description={id.menuAdmin.confirmDeleteMenuMessage.replace('{name}', menu.name)}
          confirmLabel={id.menuAdmin.confirmDeleteAction}
          onClose={() => setShowDeleteConfirmation(false)}
          onConfirm={() => onDelete(menu)}
          onSuccess={onClose}
        />
      )}
    </>
  )
}
