import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { RoleRouteGuard } from '@/app/role-route-guard'
import { useSession } from '@/app/session-context'
import { routeList } from '@/app/route-list'
import { id } from '@/lib/i18n/id'

function ProtectedLayout() {
  const { user } = useSession()

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

function EmptyRoute() {
  return <div className="empty-route" />
}

const protectedRoutes = routeList
  .filter((route) => route.path !== '/login')
  .map((route) => ({
    path: route.path.slice(1),
    element: (
      <RoleRouteGuard allowedRoles={route.roles}>
        <EmptyRoute />
      </RoleRouteGuard>
    ),
  }))

const router = createBrowserRouter([
  {
    path: '/login',
    element: <main className="login-route" aria-label={id.routes.login} />,
  },
  {
    path: '/',
    element: <ProtectedLayout />,
    children: [
      { index: true, element: <Navigate to="/kasir" replace /> },
      ...protectedRoutes,
      { path: '*', element: <Navigate to="/dasbor" replace /> },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
