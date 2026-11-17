import { useDeferredValue, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChartPie, CircleAlert, Plus, Search, ShoppingCart, SlidersHorizontal, Utensils, X } from 'lucide-react'
import { useSession } from '@/app/session-context'
import { apiError } from '@/lib/api-error'
import { id } from '@/lib/i18n/id'
import { supabase } from '@/lib/supabase/client'
import { MenuAdminTable } from './MenuAdminTable'
import { MenuConfirmDialog } from './MenuConfirmDialog'
import { MenuEditorDialog } from './MenuEditorDialog'
import { MenuModifiersDialog } from './MenuModifiersDialog'
import {
  deleteAdminMenu,
  fetchMenuAdminPage,
  fetchMenuAdminSummary,
  saveAdminMenu,
  saveAdminMenuModifiers,
  type MenuRecord,
  type MenuSavePayload,
  type MenuModifierPayload,
} from './menu-admin-data'
import './menu-admin.css'

const MENU_PAGE_SIZE = 50
const menuPageQueryKey = ['menu-admin-page'] as const
const menuSummaryQueryKey = ['menu-admin-summary'] as const

type Notice = { message: string; kind: 'success' | 'error' } | null
type MenuConfirmation = {
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => Promise<void>
} | null

function KpiCard({
  label,
  value,
  detail,
  tone,
  icon,
}: {
  label: string
  value: string
  detail?: string
  tone: 'mint' | 'peach' | 'red' | 'neutral'
  icon: ReactNode
}) {
  return (
    <article className="menu-kpi-card">
      <div className="menu-kpi-copy">
        <span>{label}</span>
        <strong className={`menu-kpi-value is-${tone}`}>{value}</strong>
        {detail && <small>{detail}</small>}
      </div>
      <span className={`menu-kpi-icon is-${tone}`}>{icon}</span>
    </article>
  )
}

export function MenuAdminPage() {
  const { user } = useSession()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [category, setCategory] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [page, setPage] = useState(1)
  const [editorMenu, setEditorMenu] = useState<MenuRecord | null | undefined>(undefined)
  const [modifierMenu, setModifierMenu] = useState<MenuRecord | null>(null)
  const [workingMenuId, setWorkingMenuId] = useState<number | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [confirmation, setConfirmation] = useState<MenuConfirmation>(null)

  const summaryQuery = useQuery({
    queryKey: menuSummaryQueryKey,
    queryFn: fetchMenuAdminSummary,
    enabled: user?.role === 'admin',
    staleTime: 60_000,
  })
  const menuQuery = useQuery({
    queryKey: [...menuPageQueryKey, deferredSearch, category, showInactive, page],
    queryFn: () => fetchMenuAdminPage({ search: deferredSearch, category, showInactive, page, pageSize: MENU_PAGE_SIZE }),
    enabled: user?.role === 'admin',
    placeholderData: (previous) => previous,
  })

  const summary = summaryQuery.data
  const rows = menuQuery.data?.rows ?? []
  const resultCount = menuQuery.data?.count ?? 0
  const catalogShare = summary && summary.total_count > 0 ? summary.total_active * 100 / summary.total_count : 0
  const categories = summary?.categories ?? []
  const isLoading = menuQuery.isPending || menuQuery.isFetching

  const refreshMenuData = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: menuPageQueryKey }),
    queryClient.invalidateQueries({ queryKey: menuSummaryQueryKey }),
  ])

  const saveMenu = async (payload: MenuSavePayload, file: File | null) => {
    setNotice(null)
    await saveAdminMenu(payload, file)
    await refreshMenuData()
    setNotice({ message: id.menuAdmin.saveSuccess, kind: 'success' })
  }

  const removeMenu = async (menu: MenuRecord) => {
    setNotice(null)
    await deleteAdminMenu(menu.menu_id)
    if (menu.photo) await supabaseRemovePhoto(menu.photo)
    await refreshMenuData()
    setNotice({ message: id.menuAdmin.deleteSuccess, kind: 'success' })
  }

  const saveModifiers = async (menu: MenuRecord, groups: MenuModifierPayload[]) => {
    setNotice(null)
    await saveAdminMenuModifiers(menu.menu_id, groups)
    await refreshMenuData()
    setNotice({ message: id.menuAdmin.modifiersSuccess, kind: 'success' })
  }

  const updateMenuField = async (menu: MenuRecord, field: 'available' | 'status') => {
    setWorkingMenuId(menu.menu_id)
    setNotice(null)
    try {
      await saveAdminMenu({
        menu_id: menu.menu_id,
        name: menu.name,
        category: menu.category,
        price: menu.price,
        cost_price: menu.cost_price,
        photo: menu.photo,
        available: field === 'available' ? !menu.available : menu.available,
        status: field === 'status' ? !menu.status : menu.status,
      }, null)
      await refreshMenuData()
      setNotice({
        message: field === 'available' ? id.menuAdmin.availabilitySuccess : id.menuAdmin.statusSuccess,
        kind: 'success',
      })
    } finally {
      setWorkingMenuId(null)
    }
  }

  const updateMenuFieldImmediately = (menu: MenuRecord, field: 'available' | 'status') => {
    void updateMenuField(menu, field).catch((error) => setNotice({ message: apiError(error), kind: 'error' }))
  }

  const requestStatusChange = (menu: MenuRecord) => {
    if (!menu.status) {
      updateMenuFieldImmediately(menu, 'status')
      return
    }

    setConfirmation({
      title: id.menuAdmin.confirmDeactivateTitle,
      description: id.menuAdmin.confirmDeactivateMessage.replace('{name}', menu.name),
      confirmLabel: id.menuAdmin.confirmDeactivateAction,
      onConfirm: () => updateMenuField(menu, 'status'),
    })
  }

  const pageError = menuQuery.isError ? apiError(menuQuery.error, id.menuAdmin.loadingError) : ''
  const summaryError = summaryQuery.isError ? apiError(summaryQuery.error, id.menuAdmin.loadingError) : ''

  return (
    <div className="menu-admin-page">
      <header className="menu-admin-heading">
        <div>
          <p className="menu-admin-eyebrow">{id.menuAdmin.eyebrow}</p>
          <h1>{id.menuAdmin.title}</h1>
        </div>
        <button type="button" className="menu-add-button" onClick={() => setEditorMenu(null)}><Plus aria-hidden="true" />{id.menuAdmin.addMenu}</button>
      </header>

      <section className="menu-kpi-grid" aria-label={id.menuAdmin.title} aria-busy={summaryQuery.isPending}>
        <KpiCard label={id.menuAdmin.activeMenu} value={String(summary?.total_active ?? 0)} detail={id.menuAdmin.catalogShare.replace('{percent}', `${catalogShare.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`)} tone="mint" icon={<Utensils aria-hidden="true" />} />
        <KpiCard label={id.menuAdmin.averageMargin} value={`${(summary?.avg_margin_pct ?? 0).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`} tone="peach" icon={<ChartPie aria-hidden="true" />} />
        <KpiCard label={id.menuAdmin.criticalStock} value={String(summary?.critical_count ?? 0)} detail={id.menuAdmin.stockHint} tone="red" icon={<ShoppingCart aria-hidden="true" />} />
        <KpiCard label={id.menuAdmin.menuWithVariants} value={String(summary?.variant_count ?? 0)} detail={id.menuAdmin.variantsHint} tone="neutral" icon={<SlidersHorizontal aria-hidden="true" />} />
      </section>

      <section className="menu-filter-card" aria-label={id.menuAdmin.searchLabel}>
        <label className="menu-search-control">
          <Search aria-hidden="true" />
          <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder={id.menuAdmin.searchPlaceholder} aria-label={id.menuAdmin.searchLabel} />
          {search && <button type="button" onClick={() => { setSearch(''); setPage(1) }} aria-label={id.menuAdmin.clearSearch}><X aria-hidden="true" /></button>}
        </label>
        <label className="menu-category-filter">
          <span className="sr-only">{id.menuAdmin.allCategories}</span>
          <select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1) }}>
            <option value="">{id.menuAdmin.allCategories}</option>
            {categories.map((value) => <option value={value} key={value}>{value}</option>)}
          </select>
        </label>
        <label className="menu-inactive-filter">
          <input type="checkbox" checked={showInactive} onChange={(event) => { setShowInactive(event.target.checked); setPage(1) }} />
          <span>{id.menuAdmin.showInactive}</span>
        </label>
        <span className="menu-registered-pill">{id.menuAdmin.registeredCount.replace('{count}', String(resultCount))}</span>
      </section>

      {notice && <p className={`menu-admin-notice is-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.message}</p>}
      {(pageError || summaryError) && (
        <div className="menu-admin-error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{pageError || summaryError}</span>
          <button type="button" onClick={() => { void menuQuery.refetch(); void summaryQuery.refetch() }}>{id.menuAdmin.retry}</button>
        </div>
      )}

      <MenuAdminTable
        rows={rows}
        count={resultCount}
        page={page}
        pageSize={MENU_PAGE_SIZE}
        isLoading={isLoading}
        workingMenuId={workingMenuId}
        onEdit={setEditorMenu}
        onEditModifiers={setModifierMenu}
        onToggleAvailability={(menu) => updateMenuFieldImmediately(menu, 'available')}
        onToggleStatus={requestStatusChange}
        onPageChange={setPage}
      />

      {editorMenu !== undefined && (
        <MenuEditorDialog
          key={editorMenu?.menu_id ?? 'new-menu'}
          menu={editorMenu}
          categories={categories}
          canDelete={Boolean(editorMenu && summary?.deletable_menu_ids.includes(editorMenu.menu_id))}
          onClose={() => setEditorMenu(undefined)}
          onSave={saveMenu}
          onDelete={removeMenu}
        />
      )}
      {modifierMenu && (
        <MenuModifiersDialog
          key={modifierMenu.menu_id}
          menuName={modifierMenu.name}
          price={modifierMenu.price}
          costPrice={modifierMenu.cost_price}
          groups={modifierMenu.groups}
          onClose={() => setModifierMenu(null)}
          onSave={(groups) => saveModifiers(modifierMenu, groups)}
        />
      )}
      {confirmation && (
        <MenuConfirmDialog
          title={confirmation.title}
          description={confirmation.description}
          confirmLabel={confirmation.confirmLabel}
          onClose={() => setConfirmation(null)}
          onConfirm={confirmation.onConfirm}
        />
      )}
    </div>
  )
}

async function supabaseRemovePhoto(path: string) {
  if (!/^menu\/[A-Za-z0-9._-]+$/.test(path)) return
  await supabase.storage.from('menu').remove([path])
}
