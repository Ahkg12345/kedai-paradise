import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Eye, EyeOff, ShieldCheck, Store, UserRoundPlus, X } from 'lucide-react'
import { apiError } from '@/lib/api-error'
import { id } from '@/lib/i18n/id'
import type { CreateStaffPayload, StaffRecord, StaffRole, UpdateStaffPayload } from './users-data'

type UserEditorDialogProps = {
  user: StaffRecord | null
  isLastActiveAdmin: boolean
  onClose: () => void
  onSave: (payload: CreateStaffPayload | UpdateStaffPayload) => Promise<void>
}

type FormValues = { name: string; username: string; role: StaffRole; password: string }
type FormErrors = Partial<Record<'name' | 'username' | 'role' | 'password', string>>

export function UserEditorDialog({ user, isLastActiveAdmin, onClose, onSave }: UserEditorDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [form, setForm] = useState<FormValues>(() => ({
    name: user?.name ?? '',
    username: user?.username ?? '',
    role: user?.role ?? 'cashier',
    password: '',
  }))
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitError, setSubmitError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const isEditing = user !== null

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  const updateForm = (field: keyof FormValues, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setSubmitError('')
  }

  const validate = (): FormErrors => {
    const nextErrors: FormErrors = {}
    if (!form.name.trim()) nextErrors.name = id.users.validation.nameRequired
    else if (form.name.trim().length > 100) nextErrors.name = id.users.validation.nameLength

    if (!isEditing && !/^[a-z0-9_]{3,30}$/.test(form.username.trim())) {
      nextErrors.username = id.users.validation.username
    }

    if (!isEditing && form.password.length < 8) nextErrors.password = id.users.validation.password
    else if (isEditing && form.password && form.password.length < 8) nextErrors.password = id.users.validation.password

    if (isEditing && isLastActiveAdmin && form.role !== 'admin') nextErrors.role = id.users.errors.lastAdmin
    return nextErrors
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setIsSaving(true)
    setSubmitError('')
    try {
      if (user) {
        await onSave({
          user_id: user.user_id,
          name: form.name.trim(),
          role: form.role,
          status: user.status,
          password: form.password,
        })
      } else {
        await onSave({
          name: form.name.trim(),
          username: form.username.trim().toLowerCase(),
          role: form.role,
          password: form.password,
        })
      }
    } catch (error) {
      setSubmitError(apiError(error, id.users.errors.generic))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <dialog
      className="phase9-dialog user-editor-dialog"
      ref={dialogRef}
      aria-labelledby="user-editor-title"
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => { if (event.target === event.currentTarget && !isSaving) onClose() }}
    >
      <form className="user-editor-form" onSubmit={handleSubmit} noValidate>
        <header className="phase9-dialog-header">
          <span className="phase9-dialog-icon is-peach"><UserRoundPlus aria-hidden="true" /></span>
          <div className="phase9-dialog-heading">
            <h2 id="user-editor-title">{isEditing ? id.users.editTitle : id.users.addTitle}</h2>
            <p>{isEditing ? id.users.editSubtitle : id.users.addSubtitle}</p>
          </div>
          <button className="phase9-icon-button" type="button" aria-label={id.users.closeDialog} onClick={onClose} disabled={isSaving}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="phase9-dialog-body">
          <label className="phase9-field" htmlFor="staff-name">
            <span>{id.users.nameLabel} <b aria-hidden="true">*</b></span>
            <input
              id="staff-name"
              autoComplete="name"
              value={form.name}
              onChange={(event) => updateForm('name', event.target.value)}
              placeholder={id.users.namePlaceholder}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'staff-name-error' : undefined}
              maxLength={120}
              required
            />
            {errors.name && <small className="phase9-field-error" id="staff-name-error">{errors.name}</small>}
          </label>

          {isEditing ? (
            <label className="phase9-field" htmlFor="staff-username">
              <span>{id.users.usernameLabel}</span>
              <span className="phase9-input-affix">
                <span aria-hidden="true">@</span>
                <input id="staff-username" value={form.username} readOnly aria-readonly="true" />
              </span>
              <small>{id.users.usernameHint}</small>
            </label>
          ) : (
            <label className="phase9-field" htmlFor="staff-username">
              <span>{id.users.usernameLabel} <b aria-hidden="true">*</b></span>
              <span className="phase9-input-affix">
                <span aria-hidden="true">@</span>
                <input
                  id="staff-username"
                  autoCapitalize="none"
                  autoComplete="username"
                  value={form.username}
                  onChange={(event) => updateForm('username', event.target.value.toLowerCase())}
                  placeholder={id.users.usernamePlaceholder}
                  aria-invalid={Boolean(errors.username)}
                  aria-describedby={errors.username ? 'staff-username-error' : 'staff-username-hint'}
                  maxLength={30}
                  required
                />
              </span>
              <small id={errors.username ? 'staff-username-error' : 'staff-username-hint'} className={errors.username ? 'phase9-field-error' : undefined}>{errors.username ?? id.users.usernameHint}</small>
            </label>
          )}

          <fieldset className="user-role-fieldset">
            <legend>{id.users.roleLabel} <b aria-hidden="true">*</b></legend>
            <div className="user-role-cards">
              <label className={`user-role-card${form.role === 'admin' ? ' is-selected' : ''}`}>
                <input type="radio" name="staff-role" value="admin" checked={form.role === 'admin'} onChange={() => updateForm('role', 'admin')} />
                <span className="user-role-card-top"><strong className="user-role-badge is-admin">{id.roles.admin}</strong><ShieldCheck aria-hidden="true" /></span>
                <span>{id.users.adminDescription}</span>
              </label>
              <label className={`user-role-card${form.role === 'cashier' ? ' is-selected' : ''}${isLastActiveAdmin ? ' is-disabled' : ''}`}>
                <input type="radio" name="staff-role" value="cashier" checked={form.role === 'cashier'} disabled={isLastActiveAdmin} onChange={() => updateForm('role', 'cashier')} />
                <span className="user-role-card-top"><strong className="user-role-badge is-cashier">{id.roles.cashier}</strong><Store aria-hidden="true" /></span>
                <span>{id.users.cashierDescription}</span>
              </label>
            </div>
            {errors.role && <small className="phase9-field-error">{errors.role}</small>}
          </fieldset>

          <label className="phase9-field" htmlFor="staff-password">
            <span>{id.users.passwordLabel}{!isEditing && <> <b aria-hidden="true">*</b></>}</span>
            <span className="phase9-password-input">
              <input
                id="staff-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={form.password}
                onChange={(event) => updateForm('password', event.target.value)}
                placeholder={isEditing ? id.users.passwordResetPlaceholder : id.users.passwordPlaceholder}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'staff-password-error' : 'staff-password-hint'}
                maxLength={128}
                required={!isEditing}
              />
              <button type="button" className="phase9-password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? id.users.hidePassword : id.users.showPassword}>
                {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </button>
            </span>
            <small id={errors.password ? 'staff-password-error' : 'staff-password-hint'} className={errors.password ? 'phase9-field-error' : undefined}>
              {errors.password ?? (isEditing ? id.users.editPasswordHint : id.users.passwordHint)}
            </small>
          </label>

          {submitError && <p className="phase9-alert is-error" role="alert">{submitError}</p>}
        </div>

        <footer className="phase9-dialog-actions">
          <button className="phase9-button is-muted" type="button" onClick={onClose} disabled={isSaving}>{id.users.cancel}</button>
          <button className="phase9-button is-primary" type="submit" disabled={isSaving} aria-busy={isSaving}>
            {isSaving ? id.users.saving : id.users.save}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
