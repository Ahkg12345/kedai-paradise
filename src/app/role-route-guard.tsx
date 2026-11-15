import { Navigate } from 'react-router-dom'
import { id } from '@/lib/i18n/id'
import { useSession } from '@/app/session-context'
import type { UserRole } from '@/types/session'

type RoleRouteGuardProps = {
  allowedRoles: readonly UserRole[]
  children: React.ReactNode
}

export function RoleRouteGuard({ allowedRoles, children }: RoleRouteGuardProps) {
  const { user } = useSession()

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!allowedRoles.includes(user.role)) {
    return <main className="access-denied">{id.noAccess}</main>
  }

  return children
}
