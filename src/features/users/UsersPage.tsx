import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, Search, ShieldCheck, UsersRound, UserRoundPlus, WalletCards, X } from 'lucide-react'
import { useSession } from '@/app/session-context'
import { apiError } from '@/lib/api-error'
import { id } from '@/lib/i18n/id'
import { createStaff, fetchStaffDirectory, updateStaff, type CreateStaffPayload, type StaffRecord, type UpdateStaffPayload } from './users-data'
import { UserEditorDialog } from './UserEditorDialog'
import './phase9.css'
import './users.css'

const staffQueryKey = ['admin-staff-directory'] as const

type Notice = { message: string; kind: 'success' | 'error' } | null

function UserKpi({ label, value, detail, tone, icon }: { label: string; value: string; detail: string; tone: 'mint' | 'neutral' | 'peach'; icon: React.ReactNode }) {
  return (
    <article className="users-kpi-card">
      <span className={`users-kpi-icon is-${tone}`}>{icon}</span>
      <div className="users-kpi-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  )
}

function initials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}

export function UsersPage() {
  const { user } = useSession()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'cashier'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [editorUser, setEditorUser] = useState<StaffRecord | 'create' | null>(null)
  const [workingUserId, setWorkingUserId] = useState<number | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const staffQuery = useQuery({
    queryKey: staffQueryKey,
    queryFn: fetchStaffDirectory,
    enabled: user?.role === 'admin',
    staleTime: 30_000,
  })

  const allUsers = staffQuery.data ?? []
  const activeAdmins = allUsers.filter((staff) => staff.status && staff.role === 'admin')
  const activeCashiers = allUsers.filter((staff) => staff.status && staff.role === 'cashier')
  const filteredUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return allUsers.filter((staff) => {
      const matchesSearch = !normalizedSearch || `${staff.name} ${staff.username}`.toLowerCase().includes(normalizedSearch)
      const matchesRole = roleFilter === 'all' || staff.role === roleFilter
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? staff.status : !staff.status)
      return matchesSearch && matchesRole && matchesStatus
    })
  }, [allUsers, roleFilter, search, statusFilter])

  const refreshUsers = async () => queryClient.invalidateQueries({ queryKey: staffQueryKey })

  const saveUser = async (payload: CreateStaffPayload | UpdateStaffPayload) => {
    setNotice(null)
    if ('user_id' in payload) await updateStaff(payload)
    else await createStaff(payload)
    await refreshUsers()
    setEditorUser(null)
    setNotice({ message: 'user_id' in payload ? id.users.updateSuccess : id.users.createSuccess, kind: 'success' })
  }

  const changeStatus = async (staff: StaffRecord, status: boolean) => {
    setWorkingUserId(staff.user_id)
    setNotice(null)
    try {
      await updateStaff({ ...staff, status, password: '' })
      await refreshUsers()
      setNotice({ message: status ? id.users.activateSuccess : id.users.deactivateSuccess, kind: 'success' })
    } catch (error) {
      await refreshUsers()
      setNotice({ message: apiError(error, id.users.errors.generic), kind: 'error' })
    } finally {
      setWorkingUserId(null)
    }
  }

  const pageError = staffQuery.isError ? apiError(staffQuery.error, id.users.loadError) : ''
  const inactiveCount = allUsers.length - allUsers.filter((staff) => staff.status).length
  const cashierHighlight = activeCashiers.length === 1 ? activeCashiers[0].name : id.users.activeCashiers.replace('{count}', String(activeCashiers.length))

  return (
    <div className="users-page">
      <header className="users-heading-card">
        <div className="users-heading-copy">
          <h1>{id.users.title}</h1>
          <p>{id.users.subtitle}</p>
        </div>
        <button className="phase9-button is-primary users-add-button" type="button" onClick={() => setEditorUser('create')}>
          <UserRoundPlus aria-hidden="true" />{id.users.add}
        </button>
      </header>

      <section className="users-kpi-grid" aria-label={id.users.summaryLabel} aria-busy={staffQuery.isPending}>
        <UserKpi
          label={id.users.totalUsers}
          value={id.users.totalUsersValue.replace('{count}', String(allUsers.length))}
          detail={id.users.roleBreakdown.replace('{admins}', String(allUsers.filter((staff) => staff.role === 'admin').length)).replace('{cashiers}', String(allUsers.filter((staff) => staff.role === 'cashier').length))}
          tone="mint"
          icon={<UsersRound aria-hidden="true" />}
        />
        <UserKpi
          label={id.users.accountStatus}
          value={id.users.activeUsers.replace('{count}', String(allUsers.length - inactiveCount))}
          detail={id.users.inactiveUsers.replace('{count}', String(inactiveCount))}
          tone="neutral"
          icon={<ShieldCheck aria-hidden="true" />}
        />
        <UserKpi
          label={id.users.activeCashierRole}
          value={cashierHighlight}
          detail={activeCashiers.length === 1 ? id.users.singleActiveCashier : id.users.cashierRoleHint}
          tone="peach"
          icon={<WalletCards aria-hidden="true" />}
        />
      </section>

      <section className="users-filter-card" aria-label={id.users.searchLabel}>
        <label className="users-search-control">
          <Search aria-hidden="true" />
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={id.users.searchPlaceholder} aria-label={id.users.searchLabel} />
          {search && <button type="button" aria-label={id.users.clearSearch} onClick={() => setSearch('')}><X aria-hidden="true" /></button>}
        </label>
        <label className="users-select-control">
          <span className="sr-only">{id.users.roleFilterLabel}</span>
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as typeof roleFilter)}>
            <option value="all">{id.users.allRoles}</option>
            <option value="admin">{id.roles.admin}</option>
            <option value="cashier">{id.roles.cashier}</option>
          </select>
        </label>
        <label className="users-select-control">
          <span className="sr-only">{id.users.statusFilterLabel}</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
            <option value="all">{id.users.allStatuses}</option>
            <option value="active">{id.users.active}</option>
            <option value="inactive">{id.users.inactive}</option>
          </select>
        </label>
      </section>

      {notice && <p className={`phase9-alert is-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.message}</p>}
      {pageError && (
        <div className="phase9-alert is-error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{pageError}</span>
          <button className="phase9-inline-button" type="button" onClick={() => { void staffQuery.refetch() }}>{id.users.retry}</button>
        </div>
      )}

      <section className="users-table-card" aria-label={id.users.tableLabel} aria-busy={staffQuery.isFetching}>
        <div className="users-table-scroll">
          <table className="users-table">
            <thead>
              <tr>
                <th scope="col">{id.users.columns.id}</th>
                <th scope="col">{id.users.columns.name}</th>
                <th scope="col">{id.users.columns.username}</th>
                <th scope="col">{id.users.columns.role}</th>
                <th scope="col">{id.users.columns.status}</th>
                <th scope="col">{id.users.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {staffQuery.isPending && <tr><td className="users-table-state" colSpan={6}>{id.users.loading}</td></tr>}
              {!staffQuery.isPending && !pageError && filteredUsers.length === 0 && <tr><td className="users-table-state" colSpan={6}>{id.users.empty}</td></tr>}
              {!pageError && filteredUsers.map((staff) => {
                const isSelf = staff.username === user?.username
                const isLastAdmin = staff.status && staff.role === 'admin' && activeAdmins.length <= 1
                const isWorking = workingUserId === staff.user_id
                const cannotDeactivate = isSelf || isLastAdmin
                const disabledReason = isSelf ? id.users.selfDeactivate : isLastAdmin ? id.users.lastAdminDisable : undefined

                return (
                  <tr key={staff.user_id} className={!staff.status ? 'is-inactive' : undefined}>
                    <td className="users-id-cell">{staff.user_id}</td>
                    <td>
                      <div className="users-name-cell">
                        <span className={`users-avatar${isSelf ? ' is-self' : ''}`} aria-hidden="true">{initials(staff.name)}</span>
                        <span className="users-name-copy"><strong>{staff.name}</strong>{isSelf && <span className="users-self-chip">{id.users.you}</span>}</span>
                        {isSelf && <small className="users-self-note">{id.users.selfDeactivate}</small>}
                      </div>
                    </td>
                    <td><code className="users-username">@{staff.username}</code></td>
                    <td><span className={`users-role-pill is-${staff.role}`}>{staff.role === 'admin' ? id.roles.admin : id.roles.cashier}</span></td>
                    <td><span className={`users-status-pill${staff.status ? ' is-active' : ' is-inactive'}`}><span aria-hidden="true" />{staff.status ? id.users.active : id.users.inactive}</span></td>
                    <td>
                      <div className="users-row-actions">
                        <button className="users-action-button is-edit" type="button" onClick={() => setEditorUser(staff)} disabled={isWorking} aria-label={`${id.users.editReset}: ${staff.name}`}>
                          {id.users.editReset}
                        </button>
                        <button
                          className={`users-action-button ${staff.status ? 'is-deactivate' : 'is-activate'}`}
                          type="button"
                          onClick={() => { void changeStatus(staff, !staff.status) }}
                          disabled={isWorking || (staff.status && cannotDeactivate)}
                          title={disabledReason}
                          aria-label={`${staff.status ? id.users.deactivate : id.users.activate}: ${staff.name}`}
                        >
                          {isWorking ? id.users.saving : staff.status ? id.users.deactivate : id.users.activate}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <footer className="users-table-footer">
          <span><ShieldCheck aria-hidden="true" />{id.users.footer.replace('{shown}', String(filteredUsers.length)).replace('{total}', String(allUsers.length))}</span>
          <span>{id.users.filteredCount.replace('{count}', String(filteredUsers.length))}</span>
        </footer>
      </section>

      {editorUser && (
        <UserEditorDialog
          key={editorUser === 'create' ? 'new-staff' : editorUser.user_id}
          user={editorUser === 'create' ? null : editorUser}
          isLastActiveAdmin={editorUser !== 'create' && editorUser.status && editorUser.role === 'admin' && activeAdmins.length <= 1}
          onClose={() => setEditorUser(null)}
          onSave={saveUser}
        />
      )}
    </div>
  )
}
