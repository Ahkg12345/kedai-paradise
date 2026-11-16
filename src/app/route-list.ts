import { id } from '@/lib/i18n/id'
import type { UserRole } from '@/types/session'

export type AppRoute = {
  path: string
  label: string
  roles: readonly UserRole[]
  navigation?: boolean
}

const bothRoles = ['admin', 'cashier'] as const
const adminOnly = ['admin'] as const

export const routeList: readonly AppRoute[] = [
  { path: '/login', label: id.routes.login, roles: [] },
  { path: '/dasbor', label: id.routes.dashboard, roles: bothRoles, navigation: true },
  { path: '/kasir', label: id.routes.cashier, roles: bothRoles, navigation: true },
  { path: '/antrian', label: id.routes.queue, roles: bothRoles, navigation: true },
  { path: '/riwayat', label: id.routes.history, roles: bothRoles, navigation: true },
  { path: '/tutup-kasir', label: id.routes.cashClosing, roles: bothRoles, navigation: true },
  { path: '/menu', label: id.routes.menu, roles: adminOnly, navigation: true },
  { path: '/keuangan', label: id.routes.finance, roles: adminOnly, navigation: true },
  { path: '/laporan', label: id.routes.reports, roles: adminOnly, navigation: true },
  { path: '/performa-menu', label: id.routes.menuPerformance, roles: adminOnly, navigation: true },
  { path: '/pengguna', label: id.routes.users, roles: adminOnly, navigation: true },
  { path: '/pengaturan', label: id.routes.settings, roles: adminOnly, navigation: true },
  { path: '/akun', label: id.routes.account, roles: bothRoles },
  { path: '/struk/:id', label: id.routes.receipt, roles: bothRoles },
] satisfies readonly AppRoute[]
