import { Coffee, Droplets, Grid3X3, Plus, Sandwich, Utensils, type LucideIcon } from 'lucide-react'
import { formatRupiah } from '@/lib/format'
import { id } from '@/lib/i18n/id'
import type { MenuItem } from '@/features/pos/pos-types'

type CategoryIcon = LucideIcon

type PosCatalogProps = {
  menu: MenuItem[]
  category: string
  search: string
  pendingMenuId: number | null
  hasModifiers: (menuId: number) => boolean
  onCategoryChange: (category: string) => void
  onSearchChange: (search: string) => void
  onSelectMenu: (item: MenuItem) => void
  onToggleAvailability: (item: MenuItem) => void
}

function iconForCategory(category: string): CategoryIcon {
  if (category === 'Makanan') return Utensils
  if (category === 'Minuman') return Coffee
  return Sandwich
}

export function PosCatalog({
  menu,
  category,
  search,
  pendingMenuId,
  hasModifiers,
  onCategoryChange,
  onSearchChange,
  onSelectMenu,
  onToggleAvailability,
}: PosCatalogProps) {
  const categoryNames = [...new Set(menu.map((item) => item.category))]
  const orderedCategories = ['Makanan', 'Minuman', 'Snack'].filter((name) => categoryNames.includes(name))
  const remainingCategories = categoryNames.filter((name) => !orderedCategories.includes(name)).sort()
  const visibleMenu = menu.filter((item) => {
    const matchesCategory = category === 'all' || item.category === category
    const matchesSearch = `${item.name} ${item.category}`.toLocaleLowerCase('id-ID').includes(search.trim().toLocaleLowerCase('id-ID'))
    return matchesCategory && matchesSearch
  })

  return (
    <section className="pos-catalog" aria-labelledby="pos-catalog-title">
      <div className="pos-catalog-heading">
        <span className="pos-catalog-icon" aria-hidden="true"><Utensils size={28} /></span>
        <div className="pos-catalog-title-wrap">
          <h1 id="pos-catalog-title">{id.pos.title}</h1>
          <span className="pos-count-chip">{menu.length} {id.pos.menuCount}</span>
        </div>
      </div>

      <div className="pos-catalog-controls">
        <label className="pos-search-field">
          <span className="sr-only">{id.pos.searchLabel}</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="pos-search-icon">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={id.pos.searchPlaceholder}
          />
        </label>

        <div className="pos-category-list" role="group" aria-label={id.pos.categories}>
          <button
            className={`pos-category-pill${category === 'all' ? ' is-selected' : ''}`}
            type="button"
            aria-pressed={category === 'all'}
            onClick={() => onCategoryChange('all')}
          >
            <Grid3X3 size={17} aria-hidden="true" />
            <span>{id.pos.allCategories}</span>
          </button>
          {[...orderedCategories, ...remainingCategories].map((name) => {
            const Icon = iconForCategory(name)
            return (
              <button
                key={name}
                className={`pos-category-pill${category === name ? ' is-selected' : ''}`}
                type="button"
                aria-pressed={category === name}
                onClick={() => onCategoryChange(name)}
              >
                <Icon size={17} aria-hidden="true" />
                <span>{name}</span>
              </button>
            )
          })}
        </div>
      </div>

      {visibleMenu.length > 0 ? (
        <div className="pos-menu-grid">
          {visibleMenu.map((item) => (
            <article className={`pos-menu-card${item.available ? '' : ' is-sold-out'}`} key={item.menu_id}>
              <button
                className="pos-menu-select"
                type="button"
                disabled={!item.available}
                onClick={() => onSelectMenu(item)}
                aria-label={`${id.pos.addToCart}: ${item.name}`}
              >
                <span className="pos-menu-photo-wrap">
                  {item.photoUrl ? (
                    <img className="pos-menu-photo" src={item.photoUrl} alt={item.name} loading="lazy" />
                  ) : (
                    <span className="pos-menu-photo-fallback" aria-hidden="true"><Droplets size={38} /></span>
                  )}
                  {hasModifiers(item.menu_id) && item.available && <span className="pos-choice-chip">{id.pos.customizable}</span>}
                  {!item.available && <span className="pos-sold-out-ribbon">{id.pos.soldOut}</span>}
                </span>
                <span className="pos-menu-name-row">
                  <span className="pos-menu-name">{item.name}</span>
                  <span className="pos-add-icon" aria-hidden="true"><Plus size={22} strokeWidth={3} /></span>
                </span>
                <span className="pos-menu-price">{formatRupiah(item.price)}</span>
              </button>

              <div className="pos-menu-status-row">
                <span>{id.pos.menuStatus}</span>
                <button
                  className={`pos-availability${item.available ? ' is-available' : ' is-unavailable'}`}
                  type="button"
                  disabled={pendingMenuId === item.menu_id}
                  onClick={() => onToggleAvailability(item)}
                  aria-label={`${item.available ? id.pos.markUnavailable : id.pos.markAvailable}: ${item.name}`}
                  title={`${item.available ? id.pos.markUnavailable : id.pos.markAvailable}: ${item.name}`}
                >
                  <span className="pos-availability-dot" aria-hidden="true" />
                  {item.available ? id.pos.available : id.pos.soldOut}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="pos-menu-empty" role="status">{id.pos.emptyMenu}</div>
      )}
    </section>
  )
}
