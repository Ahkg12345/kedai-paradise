import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { RoleRouteGuard } from '@/app/role-route-guard'
import { useSession } from '@/app/session-context'
import { routeList } from '@/app/route-list'
import { LoginPage } from '@/features/auth/LoginPage'
import { POSPage } from '@/features/pos/POSPage'
import { useCheckoutMeta } from '@/features/pos/use-checkout-meta'
import { ReceiptPage } from '@/features/receipt/ReceiptPage'
import { id } from '@/lib/i18n/id'

function ProtectedLayout() {
  const { user, isLoading } = useSession()
  const location = useLocation()
  const checkoutMeta = useCheckoutMeta(Boolean(user))

  if (isLoading) {
    return <main className="auth-loading" aria-busy="true">{id.login.loading}</main>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const isReceiptRoute = location.pathname.startsWith('/struk/')

  return (
    <>
      {!isReceiptRoute && <Header user={user} queueCount={checkoutMeta.data?.queue_count ?? 0} />}
      <main className={isReceiptRoute ? 'receipt-route-content' : 'app-content'} aria-label={id.navigation}>
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
        {route.path === '/kasir' ? <POSPage /> : route.path === '/struk/:id' ? <ReceiptPage /> : <EmptyRoute />}
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
