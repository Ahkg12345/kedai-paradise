import { ChevronLeft, ChevronRight, Coffee, Cookie, Droplet, ImageOff, Settings2, Utensils } from 'lucide-react'
import { formatRupiah, formatSignedRupiah } from '@/lib/format'
import { id } from '@/lib/i18n/id'
import type { MenuRecord } from './menu-admin-data'

function CategoryIcon({ category }: { category: string }) {
  if (category === id.menuAdmin.categories.food) return <Utensils aria-hidden="true" />
  if (category === id.menuAdmin.categories.drink) return <Coffee aria-hidden="true" />
  if (category === id.menuAdmin.categories.snack) return <Cookie aria-hidden="true" />
  return <Droplet aria-hidden="true" />
}

function formatPercent(value: number) {
  return `${value.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

function MenuPhoto({ item }: { item: MenuRecord }) {
  if (item.photoUrl) {
    return <img className="menu-photo" src={item.photoUrl} alt={item.name} loading="lazy" />
  }

  return (
    <span className="menu-photo menu-photo-empty" aria-label={id.menuAdmin.noPhoto.replace('{name}', item.name)}>
      <ImageOff aria-hidden="true" />
    </span>
  )
}

export function MenuAdminTable({
  rows,
  count,
  page,
  pageSize,
  isLoading,
  workingMenuId,
  onEdit,
  onEditModifiers,
  onToggleAvailability,
  onToggleStatus,
  onPageChange,
}: {
  rows: MenuRecord[]
  count: number
  page: number
  pageSize: number
  isLoading: boolean
  workingMenuId: number | null
  onEdit: (item: MenuRecord) => void
  onEditModifiers: (item: MenuRecord) => void
  onToggleAvailability: (item: MenuRecord) => void
  onToggleStatus: (item: MenuRecord) => void
  onPageChange: (page: number) => void
}) {
  const pageCount = Math.max(1, Math.ceil(count / pageSize))
  const firstRow = count === 0 ? 0 : (page - 1) * pageSize + 1
  const lastRow = Math.min(count, page * pageSize)

  return (
    <section className="menu-table-card" aria-label={id.menuAdmin.tableLabel} aria-busy={isLoading}>
      <div className="menu-table-scroll">
        <table className="menu-admin-table">
          <thead>
            <tr>
              <th scope="col">{id.menuAdmin.columns.photo}</th>
              <th scope="col">{id.menuAdmin.columns.name}</th>
              <th scope="col">{id.menuAdmin.columns.category}</th>
              <th scope="col">{id.menuAdmin.columns.price}</th>
              <th scope="col">{id.menuAdmin.columns.cost}</th>
              <th scope="col">{id.menuAdmin.columns.margin}</th>
              <th scope="col">{id.menuAdmin.columns.choices}</th>
              <th scope="col">{id.menuAdmin.columns.availability}</th>
              <th scope="col">{id.menuAdmin.columns.status}</th>
              <th scope="col">{id.menuAdmin.columns.actions}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && rows.length === 0 && <tr><td colSpan={10} className="menu-table-state">{id.menuAdmin.loading}</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={10} className="menu-table-state">{id.menuAdmin.empty}</td></tr>}
            {rows.map((item) => {
              const margin = item.price - item.cost_price
              const marginPercent = item.price > 0 ? margin * 100 / item.price : 0
              const isWorking = workingMenuId === item.menu_id

              return (
                <tr key={item.menu_id}>
                  <td><MenuPhoto item={item} /></td>
                  <td className="menu-name-cell">
                    <strong>{item.name}</strong>
                    <code>#{item.code}</code>
                  </td>
                  <td><span className="menu-category-chip"><CategoryIcon category={item.category} />{item.category}</span></td>
                  <td className="menu-price-cell">{formatRupiah(item.price)}</td>
                  <td className="menu-cost-cell">{formatRupiah(item.cost_price)}</td>
                  <td><span className={`menu-margin${margin < 0 ? ' is-negative' : ''}`}>
                    <strong>{formatSignedRupiah(margin)}</strong>
                    <small>{formatPercent(marginPercent)}</small>
                  </span></td>
                  <td>
                    {item.groups.length > 0 ? (
                      <span className="menu-choice-summary">
                        <strong>{id.menuAdmin.groupCount.replace('{count}', String(item.groups.length))}</strong>
                        <small>{item.groups.map((group) => group.name).join(', ')}</small>
                      </span>
                    ) : <span className="menu-no-choices">{id.menuAdmin.noChoices}</span>}
                  </td>
                  <td>
                    <label className={`menu-switch-label${item.available ? ' is-available' : ' is-unavailable'}`}>
                      <input
                        type="checkbox"
                        role="switch"
                        checked={item.available}
                        disabled={isWorking}
                        onChange={() => onToggleAvailability(item)}
                        aria-label={(item.available ? id.menuAdmin.markUnavailable : id.menuAdmin.markAvailable).replace('{name}', item.name)}
                      />
                      <span className="menu-switch-track" aria-hidden="true"><span /></span>
                      <span className="menu-switch-text">{item.available ? id.menuAdmin.available : id.menuAdmin.soldOut}</span>
                    </label>
                  </td>
                  <td><span className={`menu-status-chip${item.status ? ' is-active' : ' is-inactive'}`}><span aria-hidden="true" />{item.status ? id.menuAdmin.active : id.menuAdmin.inactive}</span></td>
                  <td>
                    <div className="menu-row-actions">
                      <button type="button" className={`menu-choice-action${item.groups.length === 0 ? ' is-empty' : ''}`} onClick={() => onEditModifiers(item)} aria-label={`${id.menuAdmin.manageChoices}: ${item.name}`} disabled={isWorking}>
                        <Settings2 aria-hidden="true" />{id.menuAdmin.manageChoices}
                      </button>
                      <button type="button" className="menu-row-button" onClick={() => onEdit(item)} disabled={isWorking}>{id.menuAdmin.edit}</button>
                      <button type="button" className="menu-row-button menu-status-action" onClick={() => onToggleStatus(item)} disabled={isWorking}>{item.status ? id.menuAdmin.deactivate : id.menuAdmin.activate}</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <footer className="menu-table-footer">
        <div>
          <span>{id.menuAdmin.rowsSummary.replace('{from}', String(firstRow)).replace('{to}', String(lastRow)).replace('{count}', String(count))}</span>
          <span className="menu-page-indicator">{id.menuAdmin.pageSummary.replace('{page}', String(page)).replace('{pages}', String(pageCount))}</span>
        </div>
        <nav className="menu-pagination" aria-label={id.menuAdmin.paginationLabel}>
          <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label={id.menuAdmin.previousPage}>
            <ChevronLeft aria-hidden="true" />{id.menuAdmin.previous}
          </button>
          <span aria-current="page">{page}</span>
          <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount} aria-label={id.menuAdmin.nextPage}>
            {id.menuAdmin.next}<ChevronRight aria-hidden="true" />
          </button>
        </nav>
      </footer>
    </section>
  )
}
