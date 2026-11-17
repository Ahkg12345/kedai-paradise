import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/app/session-context'
import { apiError } from '@/lib/api-error'
import { id } from '@/lib/i18n/id'
import { CashierDashboard } from './CashierDashboard'
import { ExecutiveDashboard } from './ExecutiveDashboard'
import { fetchCashierDashboard, fetchExecutiveDashboard } from './dashboard-data'
import './dashboard.css'

export function DashboardPage() {
  const { user } = useSession()
  const isAdmin = user?.role === 'admin'
  const cashierQuery = useQuery({
    queryKey: ['dashboard', 'cashier'],
    queryFn: fetchCashierDashboard,
    enabled: Boolean(user) && !isAdmin,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
  const executiveQuery = useQuery({
    queryKey: ['dashboard', 'executive'],
    queryFn: fetchExecutiveDashboard,
    enabled: Boolean(user) && isAdmin,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
  const query = isAdmin ? executiveQuery : cashierQuery

  if (query.isPending) {
    return <p className="dashboard-state" role="status" aria-busy="true">{id.dashboard.loading}</p>
  }

  if (query.isError) {
    return <p className="dashboard-state is-error" role="alert">{apiError(query.error, id.dashboard.loadError)}</p>
  }

  return isAdmin
    ? <ExecutiveDashboard data={executiveQuery.data!} />
    : <CashierDashboard data={cashierQuery.data!} />
}
