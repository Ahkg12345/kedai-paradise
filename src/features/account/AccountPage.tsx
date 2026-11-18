import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, Info, ShieldCheck, UserRoundCog, CircleCheck, X } from 'lucide-react'
import { useSession } from '@/app/session-context'
import { apiError } from '@/lib/api-error'
import { id } from '@/lib/i18n/id'
import { changeOwnPassword } from './account-data'
import '../users/phase9.css'
import './account.css'

type PasswordField = 'current' | 'next' | 'confirm'

export function AccountPage() {
  const { user } = useSession()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [visibleFields, setVisibleFields] = useState<Record<PasswordField, boolean>>({ current: false, next: false, confirm: false })
  const [successVisible, setSuccessVisible] = useState(false)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const toggleVisibility = (field: PasswordField) => setVisibleFields((current) => ({ ...current, [field]: !current[field] }))
  const clearError = () => setError('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSuccessVisible(false)

    if (!currentPassword) {
      setError(id.myAccount.errors.currentRequired)
      return
    }
    if (newPassword.length < 8) {
      setError(id.myAccount.errors.passwordLength)
      return
    }
    if (confirmPassword !== newPassword) {
      setError(id.myAccount.errors.passwordMismatch)
      return
    }

    setIsSaving(true)
    try {
      await changeOwnPassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccessVisible(true)
    } catch (caughtError) {
      setError(apiError(caughtError, id.myAccount.errors.generic))
    } finally {
      setIsSaving(false)
    }
  }

  const renderPasswordField = (field: PasswordField, label: string, value: string, setValue: (value: string) => void, hint?: string, required = false) => {
    const inputId = `account-password-${field}`
    return (
      <label className="phase9-field account-password-field" htmlFor={inputId}>
        <span className="account-password-label">{label}{required && <small>{id.myAccount.required}</small>}</span>
        <span className="phase9-password-input">
          <input
            id={inputId}
            type={visibleFields[field] ? 'text' : 'password'}
            autoComplete={field === 'current' ? 'current-password' : 'new-password'}
            value={value}
            onChange={(event) => { setValue(event.target.value); clearError() }}
            maxLength={128}
            required={required}
          />
          <button type="button" className="phase9-password-toggle" onClick={() => toggleVisibility(field)} aria-label={visibleFields[field] ? id.myAccount.hidePassword : id.myAccount.showPassword}>
            {visibleFields[field] ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </button>
        </span>
        {hint && <small className="account-password-hint"><Info aria-hidden="true" />{hint}</small>}
      </label>
    )
  }

  return (
    <div className="account-page">
      <section className="account-card" aria-labelledby="account-title">
        {successVisible && (
          <div className="account-success-alert" role="status">
            <CircleCheck aria-hidden="true" />
            <span>{id.myAccount.passwordUpdated}</span>
            <button type="button" onClick={() => setSuccessVisible(false)} aria-label={id.myAccount.closeSuccess}><X aria-hidden="true" /></button>
          </div>
        )}

        <div className="account-card-heading">
          <div><h1 id="account-title">{id.myAccount.title}</h1><p>{id.myAccount.subtitle}</p></div>
          <span className="account-heading-icon"><UserRoundCog aria-hidden="true" /></span>
        </div>

        <form className="account-password-form" onSubmit={handleSubmit} noValidate aria-busy={isSaving}>
          {renderPasswordField('current', id.myAccount.currentPassword, currentPassword, setCurrentPassword, undefined, true)}
          {renderPasswordField('next', id.myAccount.newPassword, newPassword, setNewPassword, id.myAccount.passwordHint)}
          {renderPasswordField('confirm', id.myAccount.confirmPassword, confirmPassword, setConfirmPassword)}
          {error && <p className="phase9-alert is-error account-error" role="alert">{error}</p>}
          <button className="phase9-button is-primary account-save-button" type="submit" disabled={isSaving}>
            <ShieldCheck aria-hidden="true" />{isSaving ? id.myAccount.saving : id.myAccount.save}
          </button>
        </form>

        <footer className="account-card-footer"><ShieldCheck aria-hidden="true" />{id.myAccount.authenticatedSession.replace('{name}', user?.name ?? '')}</footer>
      </section>
    </div>
  )
}
