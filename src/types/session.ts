export type UserRole = 'admin' | 'cashier'

export type SessionUser = {
  name: string
  username: string
  role: UserRole
}
