import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banknote, Check, CircleAlert, Coins, ImagePlus, Info, Landmark, Percent, ReceiptText, Save, Store, WalletCards } from 'lucide-react'
import { apiError } from '@/lib/api-error'
import { id } from '@/lib/i18n/id'
import { fetchAdminSettings, saveAdminSettings, validateSettingsForm, type AdminSettings, type SettingsFormValues } from './settings-data'
import '../users/phase9.css'
import './settings.css'

const settingsQueryKey = ['admin-settings'] as const

function formatPoolPercent(value: number) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0)
}

function SettingsForm({ settings }: { settings: AdminSettings }) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [savedSettings, setSavedSettings] = useState(settings)
  const [form, setForm] = useState<SettingsFormValues>(() => ({
    business_name: settings.business_name,
    business_address: settings.business_address,
    table_count: String(settings.table_count),
    receipt_footer: settings.receipt_footer,
    operating_percent: Number(settings.operating_percent).toFixed(2),
    qris_bank: settings.qris_bank,
    qris_owner_name: settings.qris_owner_name,
  }))
  const [qrisFile, setQrisFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ message: string; kind: 'success' | 'error' } | null>(null)
  const saveMutation = useMutation({
    mutationFn: ({ payload, file }: { payload: ReturnType<typeof validateSettingsForm>; file: File | null }) => saveAdminSettings(payload, file, savedSettings.qris_image),
    onSuccess: (saved) => {
      setSavedSettings(saved)
      queryClient.setQueryData(settingsQueryKey, saved)
    },
  })

  useEffect(() => {
    if (!qrisFile) {
      setFilePreview(null)
      return
    }
    const url = URL.createObjectURL(qrisFile)
    setFilePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [qrisFile])

  const setValue = (field: keyof SettingsFormValues, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setNotice(null)
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    if (!file) return
    if (file.size > 2_097_152) {
      setNotice({ message: id.settings.validation.fileSize, kind: 'error' })
      event.target.value = ''
      return
    }
    if (file.type !== 'image/jpeg' && file.type !== 'image/png') {
      setNotice({ message: id.settings.validation.fileType, kind: 'error' })
      event.target.value = ''
      return
    }
    setQrisFile(file)
    setNotice(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setNotice(null)
    try {
      const payload = validateSettingsForm(form)
      await saveMutation.mutateAsync({ payload, file: qrisFile })
      setQrisFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setNotice({ message: id.settings.saveSuccess, kind: 'success' })
    } catch (error) {
      setNotice({ message: apiError(error, id.settings.saveError), kind: 'error' })
    }
  }

  const operatingPercent = Number(form.operating_percent)
  const safeOperatingPercent = Number.isFinite(operatingPercent) ? Math.min(100, Math.max(0, operatingPercent)) : 0
  const profitPercent = 100 - safeOperatingPercent
  const previewUrl = filePreview ?? savedSettings.qris_image_url
  const imageName = qrisFile?.name ?? savedSettings.qris_image?.split('/').at(-1) ?? ''
  const formula = safeOperatingPercent === 50
    ? id.settings.equalFormula.replace('{operating}', formatPoolPercent(safeOperatingPercent)).replace('{profit}', formatPoolPercent(profitPercent))
    : id.settings.distributionFormula.replace('{operating}', formatPoolPercent(safeOperatingPercent)).replace('{profit}', formatPoolPercent(profitPercent))

  return (
    <form className="settings-page" onSubmit={handleSubmit} noValidate aria-busy={saveMutation.isPending}>
      <header className="settings-page-heading">
        <h1>{id.settings.title}</h1>
        <p>{id.settings.subtitle}</p>
      </header>

      {notice && <p className={`phase9-alert is-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.message}</p>}

      <section className="settings-card identity-settings-card" aria-labelledby="settings-identity-title">
        <header className="settings-card-heading">
          <span className="settings-card-icon is-mint"><Store aria-hidden="true" /></span>
          <div><h2 id="settings-identity-title">{id.settings.identityTitle}</h2><p>{id.settings.identitySubtitle}</p></div>
        </header>

        <div className="settings-identity-grid">
          <label className="phase9-field" htmlFor="business-name">
            <span>{id.settings.businessName}</span>
            <span className="settings-input-wrap"><Store aria-hidden="true" /><input id="business-name" value={form.business_name} maxLength={100} onChange={(event) => setValue('business_name', event.target.value)} /></span>
            <small>{id.settings.businessNameHint}</small>
          </label>
          <label className="phase9-field" htmlFor="table-count">
            <span>{id.settings.tableCount}</span>
            <span className="settings-input-wrap"><Store aria-hidden="true" /><input id="table-count" type="number" min={1} step={1} inputMode="numeric" value={form.table_count} onChange={(event) => setValue('table_count', event.target.value)} /><span className="settings-input-suffix">{id.settings.tableSuffix}</span></span>
            <small>{id.settings.tableCountHint}</small>
          </label>
          <label className="phase9-field settings-field-wide" htmlFor="business-address">
            <span>{id.settings.businessAddress}</span>
            <span className="settings-input-wrap"><Landmark aria-hidden="true" /><input id="business-address" value={form.business_address} maxLength={200} onChange={(event) => setValue('business_address', event.target.value)} /></span>
            <small>{id.settings.businessAddressHint}</small>
          </label>
          <label className="phase9-field settings-field-wide" htmlFor="receipt-footer">
            <span>{id.settings.receiptFooter}</span>
            <span className="settings-input-wrap"><ReceiptText aria-hidden="true" /><input id="receipt-footer" value={form.receipt_footer} maxLength={200} onChange={(event) => setValue('receipt_footer', event.target.value)} /></span>
            <small>{id.settings.receiptFooterHint}</small>
          </label>
        </div>

        <footer className="settings-save-bar">
          <p><Info aria-hidden="true" /><span>{id.settings.applyNotice}</span></p>
          <button className="phase9-button is-primary settings-save-button" type="submit" disabled={saveMutation.isPending}>
            <Save aria-hidden="true" />{saveMutation.isPending ? id.settings.saving : id.settings.save}
          </button>
        </footer>
      </section>

      <section className="settings-card pool-settings-card" aria-labelledby="settings-pool-title">
        <header className="settings-card-heading">
          <span className="settings-card-icon is-peach"><WalletCards aria-hidden="true" /></span>
          <div><h2 id="settings-pool-title">{id.settings.poolTitle}</h2><p>{id.settings.poolSubtitle}</p></div>
        </header>

        <div className="pool-settings-layout">
          <div className="pool-settings-copy">
            <label className="phase9-field" htmlFor="operating-percent">
              <span>{id.settings.operatingPercent}</span>
              <span className="settings-input-wrap"><Percent aria-hidden="true" /><input id="operating-percent" type="number" min={0} max={100} step="0.01" value={form.operating_percent} onChange={(event) => setValue('operating_percent', event.target.value)} /><span className="settings-input-suffix">{id.settings.percentSuffix}</span></span>
              <small>{id.settings.operatingPercentHint}</small>
            </label>
            <div className="settings-formula">
              <strong><Banknote aria-hidden="true" />{id.settings.formulaTitle}</strong>
              <p>{formula}</p>
            </div>
          </div>

          <div className="pool-diagram" aria-label={id.settings.diagramLabel}>
            <div className="pool-diagram-heading"><span>{id.settings.diagramTitle}</span><span className="pool-live-tag">{id.settings.liveTag}</span></div>
            <div className="pool-connector" aria-hidden="true"><span /></div>
            <div className="pool-cards">
              <article className="pool-card is-restock">
                <div className="pool-card-top"><small>{id.settings.poolOne}</small><span><ReceiptText aria-hidden="true" /></span></div>
                <strong>{id.settings.restockShare}</strong>
                <b>{id.settings.restockPool}</b>
                <p>{id.settings.restockDescription}</p>
              </article>
              <article className="pool-card is-operating">
                <div className="pool-card-top"><small>{id.settings.poolTwo}</small><span><Coins aria-hidden="true" /></span></div>
                <strong>{formatPoolPercent(safeOperatingPercent)}% {id.settings.profitLabel}</strong>
                <b>{id.settings.operatingPool}</b>
                <p>{id.settings.operatingDescription}</p>
              </article>
              <article className="pool-card is-profit">
                <div className="pool-card-top"><small>{id.settings.poolThree}</small><span><WalletCards aria-hidden="true" /></span></div>
                <strong>{formatPoolPercent(profitPercent)}% {id.settings.profitLabel}</strong>
                <b>{id.settings.netProfitPool}</b>
                <p>{id.settings.netProfitDescription}</p>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="settings-card qris-settings-card" aria-labelledby="settings-qris-title">
        <header className="settings-card-heading">
          <span className="settings-card-icon is-mint"><ReceiptText aria-hidden="true" /></span>
          <div><h2 id="settings-qris-title">{id.settings.qrisTitle}</h2><p>{id.settings.qrisSubtitle}</p></div>
        </header>

        <div className="qris-settings-layout">
          <div className="qris-settings-fields">
            <label className="phase9-field" htmlFor="qris-bank">
              <span>{id.settings.qrisBank}</span>
              <span className="settings-input-wrap"><Landmark aria-hidden="true" /><input id="qris-bank" value={form.qris_bank} maxLength={50} onChange={(event) => setValue('qris_bank', event.target.value)} /></span>
            </label>
            <label className="phase9-field" htmlFor="qris-owner">
              <span>{id.settings.qrisOwner}</span>
              <span className="settings-input-wrap"><WalletCards aria-hidden="true" /><input id="qris-owner" value={form.qris_owner_name} maxLength={100} onChange={(event) => setValue('qris_owner_name', event.target.value)} /></span>
              <small>{id.settings.qrisOwnerHint}</small>
            </label>
            <div className="phase9-field">
              <span>{id.settings.uploadQris}</span>
              <div className="qris-upload-row">
                <span className="qris-upload-icon"><ImagePlus aria-hidden="true" /></span>
                <span className="qris-upload-copy">
                  <strong>{imageName || id.settings.noQrisImage}</strong>
                  <small><span>{id.settings.fileSizeHint}</span>{imageName && <Check aria-label={id.settings.fileReady} />}</small>
                </span>
                <label className="qris-change-file" htmlFor="qris-image-input">{id.settings.changeFile}<input id="qris-image-input" ref={fileInputRef} type="file" accept="image/png,image/jpeg" onChange={handleFileChange} aria-label={id.settings.changeFile} /></label>
              </div>
            </div>
          </div>

          <aside className="qris-preview-card" aria-label={id.settings.previewLabel}>
            <h3>{id.settings.previewTitle}</h3>
            <div className="qris-receipt-preview">
              {previewUrl ? <img src={previewUrl} alt={id.settings.qrisImageAlt} /> : <div className="qris-image-empty"><ImagePlus aria-hidden="true" /><span>{id.settings.noQrisImage}</span></div>}
              <span>{form.qris_owner_name || savedSettings.qris_owner_name || id.settings.qrisOwner}</span>
              <small>{id.settings.printedAtCashier}</small>
            </div>
            <p><ReceiptText aria-hidden="true" />{id.settings.printReady}</p>
          </aside>
        </div>
      </section>
    </form>
  )
}

export function SettingsPage() {
  const settingsQuery = useQuery({ queryKey: settingsQueryKey, queryFn: fetchAdminSettings, staleTime: 60_000 })

  if (settingsQuery.isPending) return <main className="settings-page-state" aria-busy="true">{id.settings.loading}</main>
  if (settingsQuery.isError) {
    return (
      <main className="settings-page-state">
        <p className="phase9-alert is-error" role="alert"><CircleAlert aria-hidden="true" />{apiError(settingsQuery.error, id.settings.loadError)}</p>
        <button className="phase9-button is-muted" type="button" onClick={() => { void settingsQuery.refetch() }}>{id.settings.retry}</button>
      </main>
    )
  }

  return <SettingsForm settings={settingsQuery.data} />
}
