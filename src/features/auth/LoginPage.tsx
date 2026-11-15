import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, LockKeyhole, UserRound, Utensils, TriangleAlert } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session-context'
import { id } from '@/lib/i18n/id'

function formatLockCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

export function LoginPage() {
  const { user, isLoading, signIn } = useSession()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [alertMessage, setAlertMessage] = useState<string | null>(null)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [remainingSeconds, setRemainingSeconds] = useState(0)

  useEffect(() => {
    if (lockedUntil === null) {
      setRemainingSeconds(0)
      return
    }

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1_000))
      setRemainingSeconds(remaining)
      if (remaining === 0) setLockedUntil(null)
    }

    updateCountdown()
    const interval = window.setInterval(updateCountdown, 1_000)
    return () => window.clearInterval(interval)
  }, [lockedUntil])

  if (isLoading) {
    return <main className="login-page auth-loading" aria-busy="true">{id.login.loading}</main>
  }

  if (user) {
    return <Navigate to={user.role === 'admin' ? '/dasbor' : '/kasir'} replace />
  }

  const isLocked = remainingSeconds > 0

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isLocked || isSubmitting) return

    setAlertMessage(null)
    setIsSubmitting(true)

    try {
      const result = await signIn(username, password)
      if (!result.ok) {
        setAlertMessage(result.message)
        if (result.retryAfterSeconds && result.retryAfterSeconds > 0) {
          setLockedUntil(Date.now() + result.retryAfterSeconds * 1_000)
        }
        return
      }

      navigate(result.user.role === 'admin' ? '/dasbor' : '/kasir', { replace: true })
    } finally {
      setIsSubmitting(false)
    }
  }

  function updateUsername(value: string) {
    setUsername(value)
    setAlertMessage(null)
    setLockedUntil(null)
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-card-content">
          <header className="login-brand">
            <span className="login-logo-tile" aria-hidden="true">
              <Utensils size={27} strokeWidth={2.1} />
            </span>
            <h1 id="login-title">{id.brand}</h1>
            <p>{id.login.subtitle}</p>
          </header>

          {alertMessage && (
            <div className="login-alert" id="login-error" role="alert">
              <TriangleAlert size={20} aria-hidden="true" />
              <div>
                <p>{alertMessage}</p>
                {isLocked && (
                  <p className="login-lock-countdown">
                    {id.login.retryCountdown} {formatLockCountdown(remainingSeconds)}
                  </p>
                )}
              </div>
            </div>
          )}

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="username">{id.login.username}</label>
              <div className={`login-input-wrap${isLocked ? ' is-locked' : ''}`}>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={30}
                  placeholder={id.login.usernamePlaceholder}
                  value={username}
                  onChange={(event) => updateUsername(event.currentTarget.value)}
                  required
                  aria-invalid={Boolean(alertMessage)}
                  aria-describedby={alertMessage ? 'login-error' : undefined}
                  disabled={isSubmitting}
                />
                <UserRound className="login-input-icon" size={19} aria-hidden="true" />
              </div>
            </div>

            <div className="login-field">
              <div className="login-label-row">
                <label htmlFor="password">{id.login.password}</label>
                <div className="login-help-wrap">
                  <button
                    className="login-help-button"
                    type="button"
                    aria-expanded={isHelpOpen}
                    aria-controls="login-help-popover"
                    onClick={() => setIsHelpOpen((open) => !open)}
                  >
                    {id.login.help}
                  </button>
                  {isHelpOpen && (
                    <div className="login-help-popover" id="login-help-popover" role="status">
                      {id.login.helpText}
                    </div>
                  )}
                </div>
              </div>
              <div className={`login-input-wrap${isLocked ? ' is-locked' : ''}`}>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder={id.login.passwordPlaceholder}
                  value={password}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                  required
                  aria-invalid={Boolean(alertMessage)}
                  disabled={isLocked || isSubmitting}
                />
                <button
                  className="login-password-toggle"
                  type="button"
                  aria-label={showPassword ? id.login.hidePassword : id.login.showPassword}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                  disabled={isLocked || isSubmitting}
                >
                  {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
                </button>
              </div>
            </div>

            <button className="login-submit" type="submit" disabled={isLocked || isSubmitting}>
              <span>{isSubmitting ? id.login.submitting : id.login.submit}</span>
              {!isSubmitting && <ArrowRight size={20} aria-hidden="true" />}
            </button>
          </form>

          <p className="login-security-note">
            <LockKeyhole size={16} aria-hidden="true" />
            <span>{id.login.securityNote}</span>
          </p>
        </div>
      </section>
    </main>
  )
}
