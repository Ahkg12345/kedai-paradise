import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { RoleRouteGuard } from '@/app/role-route-guard'
import { useSession } from '@/app/session-context'
import { routeList } from '@/app/route-list'
import { LoginPage } from '@/features/auth/LoginPage'
import { POSPage } from '@/features/pos/POSPage'
import { id } from '@/lib/i18n/id'

function ProtectedLayout() {
  const { user, isLoading } = useSession()

  if (isLoading) {
    return <main className="auth-loading" aria-busy="true">{id.login.loading}</main>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return (
    <>
      <Header user={user} />
      <main className="app-content" aria-label={id.navigation}>
        <Outlet />
      </main>
    </>
  )
}

function LandingRoute() {
  const { user } = useSession()
  return <Navigate to={user?.role === 'admin' ? '/dasbor' : '/kasir'} replace />
}

function EmptyRoute() {
  return <div className="empty-route" />
}

const protectedRoutes = routeList
  .filter((route) => route.path !== '/login')
  .map((route) => ({
    path: route.path.slice(1),
    element: (
      <RoleRouteGuard allowedRoles={route.roles}>
        {route.path === '/kasir' ? <POSPage /> : <EmptyRoute />}
      </RoleRouteGuard>
    ),
  }))

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <ProtectedLayout />,
    children: [
      { index: true, element: <LandingRoute /> },
      ...protectedRoutes,
      { path: '*', element: <LandingRoute /> },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
