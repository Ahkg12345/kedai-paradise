import { useEffect, useState, type FormEvent } from 'react'
import { formatInTimeZone } from 'date-fns-tz'
import { ArrowDown, ArrowUp, NotebookPen, Plus } from 'lucide-react'
import { terbilang } from '@/lib/format'
import { id } from '@/lib/i18n/id'
import { financeEntrySchema, type FinanceEntryPayload, type FinanceRecord, type FinanceType, type FinancePool } from './finance-data'

const WIB_TIME_ZONE = 'Asia/Jakarta'

type FinanceFormValues = {
  date: string
  type: FinanceType
  category: string
  pool: FinancePool
  amount: string
  description: string
}

type FinanceFormErrors = Partial<Record<keyof FinanceFormValues, string>>

function currentWibInputValue() {
  return formatInTimeZone(new Date(), WIB_TIME_ZONE, "yyyy-MM-dd'T'HH:mm")
}

function amountInputValue(amount: number) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(amount)
}

function toFormValues(record?: FinanceRecord | null): FinanceFormValues {
  if (!record) {
    return { date: currentWibInputValue(), type: 'expense', category: '', pool: 'restock', amount: '', description: '' }
  }

  return {
    date: formatInTimeZone(new Date(record.date), WIB_TIME_ZONE, "yyyy-MM-dd'T'HH:mm"),
    type: record.type,
    category: record.category,
    pool: record.pool,
    amount: amountInputValue(record.amount),
    description: record.description ?? '',
  }
}

export function FinanceEntryForm({
  categories,
  record,
  resetToken,
  isSaving,
  submissionError,
  onSubmit,
  onCancelEdit,
}: {
  categories: string[]
  record: FinanceRecord | null
  resetToken: number
  isSaving: boolean
  submissionError: string
  onSubmit: (payload: FinanceEntryPayload) => Promise<void>
  onCancelEdit: () => void
}) {
  const [values, setValues] = useState<FinanceFormValues>(() => toFormValues(record))
  const [errors, setErrors] = useState<FinanceFormErrors>({})
  const amount = Number(values.amount.replace(/\D/g, ''))
  const amountWords = Number.isSafeInteger(amount) && amount > 0
    ? `${terbilang(amount).replace(/^./, (first) => first.toUpperCase())} ${id.finance.rupiahWord}`
    : ''

  useEffect(() => {
    setValues(toFormValues(record))
    setErrors({})
  }, [record, resetToken])

  const updateValue = <K extends keyof FinanceFormValues>(key: K, value: FinanceFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = financeEntrySchema.safeParse(values)

    if (!result.success) {
      const nextErrors: FinanceFormErrors = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof FinanceFormValues | undefined
        if (field && !nextErrors[field]) nextErrors[field] = issue.message
      }
      setErrors(nextErrors)
      return
    }

    setErrors({})
    await onSubmit(result.data)
  }

  return (
    <section className="finance-card finance-entry-card" aria-labelledby="finance-entry-title">
      <header className="finance-card-heading">
        <span className="finance-card-icon" aria-hidden="true"><NotebookPen /></span>
        <div className="finance-card-title-copy">
          <h2 id="finance-entry-title">{id.finance.formTitle}</h2>
          <p>{id.finance.formSubtitle}</p>
        </div>
        <span className="finance-standard-tag">{id.finance.standardTag}</span>
      </header>

      <form className="finance-entry-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="finance-form-grid">
          <label className="finance-form-field" data-invalid={Boolean(errors.date)}>
            <span>{id.finance.dateLabel} <b>*</b></span>
            <input
              type="datetime-local"
              value={values.date}
              max={currentWibInputValue()}
              aria-invalid={Boolean(errors.date)}
              aria-describedby={errors.date ? 'finance-date-error' : 'finance-date-hint'}
              onChange={(event) => updateValue('date', event.target.value)}
            />
            {errors.date ? <small className="finance-field-error" id="finance-date-error">{errors.date}</small> : <small id="finance-date-hint">{id.finance.dateHint}</small>}
          </label>

          <fieldset className="finance-form-field finance-type-field">
            <legend>{id.finance.typeLabel} <b>*</b></legend>
            <div className="finance-type-toggle" role="group" aria-label={id.finance.typeLabel}>
              <button
                type="button"
                className={values.type === 'expense' ? 'is-selected is-expense' : ''}
                aria-pressed={values.type === 'expense'}
                onClick={() => updateValue('type', 'expense')}
              ><ArrowUp aria-hidden="true" />{id.finance.expense}</button>
              <button
                type="button"
                className={values.type === 'income' ? 'is-selected is-income' : ''}
                aria-pressed={values.type === 'income'}
                onClick={() => updateValue('type', 'income')}
              ><ArrowDown aria-hidden="true" />{id.finance.income}</button>
            </div>
            <small>{id.finance.typeHint}</small>
          </fieldset>

          <label className="finance-form-field" data-invalid={Boolean(errors.category)}>
            <span>{id.finance.categoryLabel} <b>*</b></span>
            <input
              type="text"
              value={values.category}
              list="finance-category-suggestions"
              maxLength={100}
              autoComplete="off"
              aria-invalid={Boolean(errors.category)}
              aria-describedby={errors.category ? 'finance-category-error' : 'finance-category-hint'}
              onChange={(event) => updateValue('category', event.target.value)}
            />
            <datalist id="finance-category-suggestions">
              {categories.map((category) => <option key={category} value={category} />)}
            </datalist>
            {errors.category ? <small className="finance-field-error" id="finance-category-error">{errors.category}</small> : <small id="finance-category-hint">{id.finance.categoryHint}</small>}
          </label>

          <label className="finance-form-field" data-invalid={Boolean(errors.pool)}>
            <span>{id.finance.poolLabel} <b>*</b></span>
            <select value={values.pool} aria-label={id.finance.poolLabel} onChange={(event) => updateValue('pool', event.target.value as FinancePool)}>
              <option value="restock">{id.finance.pools.restock}</option>
              <option value="operating">{id.finance.pools.operating}</option>
              <option value="profit">{id.finance.pools.profit}</option>
            </select>
            <small>{id.finance.poolHint}</small>
          </label>

          <label className="finance-form-field" data-invalid={Boolean(errors.amount)}>
            <span>{id.finance.amountLabel} <b>*</b></span>
            <div className="finance-money-input" aria-invalid={Boolean(errors.amount)}>
              <span aria-hidden="true">Rp</span>
              <input
                type="text"
                inputMode="numeric"
                value={values.amount}
                aria-label={id.finance.amountLabel}
                aria-invalid={Boolean(errors.amount)}
                aria-describedby={errors.amount ? 'finance-amount-error' : 'finance-amount-words'}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, '')
                  updateValue('amount', digits ? amountInputValue(Number(digits)) : '')
                }}
              />
            </div>
            {errors.amount ? <small className="finance-field-error" id="finance-amount-error">{errors.amount}</small> : <small id="finance-amount-words">{amountWords}</small>}
          </label>

          <label className="finance-form-field" data-invalid={Boolean(errors.description)}>
            <span>{id.finance.descriptionLabel}</span>
            <input
              type="text"
              value={values.description}
              maxLength={200}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={errors.description ? 'finance-description-error' : 'finance-description-hint'}
              onChange={(event) => updateValue('description', event.target.value)}
            />
            {errors.description ? <small className="finance-field-error" id="finance-description-error">{errors.description}</small> : <small id="finance-description-hint">{id.finance.descriptionHint}</small>}
          </label>
        </div>

        {submissionError && <p className="finance-form-error" role="alert">{submissionError}</p>}

        <button className="finance-submit-button" type="submit" disabled={isSaving}>
          <Plus aria-hidden="true" />{isSaving ? id.finance.saving : record ? id.finance.saveChanges : id.finance.saveRecord}
        </button>
        {record && <button className="finance-cancel-edit" type="button" onClick={onCancelEdit} disabled={isSaving}>{id.finance.cancelEdit}</button>}
      </form>
    </section>
  )
}
