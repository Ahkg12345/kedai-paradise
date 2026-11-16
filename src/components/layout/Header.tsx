import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Clock3, LogOut, Menu, Utensils, UserRound, X } from 'lucide-react'
import { routeList } from '@/app/route-list'
import { useSession } from '@/app/session-context'
import { id } from '@/lib/i18n/id'
import { formatDateTimeWib } from '@/lib/format'
import type { SessionUser } from '@/types/session'

type HeaderProps = {
  user: SessionUser
  queueCount?: number
}

export function Header({ user, queueCount = 0 }: HeaderProps) {
  const { signOut } = useSession()
  const navigate = useNavigate()
  const [now, setNow] = useState(() => new Date())
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false)
  const navItems = routeList.filter((route) => route.navigation && route.roles.includes(user.role))
  const roleLabel = user.role === 'admin' ? id.roles.admin : id.roles.cashier
  const avatarInitial = user.username.trim().charAt(0).toUpperCase()

  useEffect(() => {
    const clockInterval = window.setInterval(() => setNow(new Date()), 1_000)
    const updateOnlineStatus = () => setIsOnline(navigator.onLine)

    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)

    return () => {
      window.clearInterval(clockInterval)
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
    }
  }, [])

  const handleLogout = async () => {
    await signOut()
    setIsMobileNavigationOpen(false)
    navigate('/login')
  }

  const renderNavItems = (mobile = false) => navItems.map((route) => (
    <NavLink
      key={route.path}
      to={route.path}
      end
      className={({ isActive }) => `header-nav-link${isActive ? ' is-active' : ''}`}
      onClick={mobile ? () => setIsMobileNavigationOpen(false) : undefined}
    >
      <span>{route.label}</span>
      {route.path === '/antrian' && queueCount > 0 && (
        <span className="queue-count" aria-label={`${id.queueCount}: ${queueCount}`}>
          {queueCount}
        </span>
      )}
    </NavLink>
  ))

  return (
    <header className="app-header">
      <div className="header-top-row">
        <Link className="header-brand" to={user.role === 'admin' ? '/dasbor' : '/kasir'} aria-label={id.brand}>
          <span className="brand-tile" aria-hidden="true">
            <Utensils size={23} strokeWidth={2.3} />
          </span>
          <span className="brand-copy">
            <span className="brand-name">{id.brand}</span>
            <span className="brand-address">{id.address}</span>
          </span>
        </Link>

        <div className="header-tools">
          <time className="header-clock" dateTime={now.toISOString()} aria-live="off">
            <Clock3 size={17} aria-hidden="true" />
            <span>{formatDateTimeWib(now, true)}</span>
          </time>

          <span className={`connection-pill${isOnline ? '' : ' is-offline'}`} role="status">
            <span className="connection-dot" aria-hidden="true" />
            {isOnline ? id.online : id.offline}
          </span>

          <Link className="header-user-link" to="/akun" aria-label={`${user.name}, ${id.account}`}>
            <span className="header-user-copy">
              <span className="header-user-name">{user.name}</span>
              <span className="role-badge">{roleLabel}</span>
            </span>
            <span className="avatar-circle" aria-hidden="true">
              {avatarInitial || <UserRound size={18} />}
            </span>
          </Link>

          <button className="logout-button" type="button" onClick={handleLogout}>
            <LogOut size={17} aria-hidden="true" />
            <span>{id.logout}</span>
          </button>
        </div>

        <button
          className="mobile-menu-button"
          type="button"
          aria-label={isMobileNavigationOpen ? id.closeNavigation : id.openNavigation}
          aria-controls="mobile-navigation"
          aria-expanded={isMobileNavigationOpen}
          onClick={() => setIsMobileNavigationOpen((open) => !open)}
        >
          {isMobileNavigationOpen ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
        </button>
      </div>

      <nav className="header-navigation desktop-navigation" aria-label={id.navigation}>
        {renderNavItems()}
      </nav>

      {isMobileNavigationOpen && (
        <nav className="header-navigation mobile-navigation" id="mobile-navigation" aria-label={id.mobileNavigation}>
          {renderNavItems(true)}
        </nav>
      )}
    </header>
  )
}
