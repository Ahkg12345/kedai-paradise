import { z } from 'zod'
import { id } from '@/lib/i18n/id'
import { supabase } from '@/lib/supabase/client'

export type AdminSettings = {
  settings_id: number
  business_name: string
  business_address: string
  table_count: number
  receipt_footer: string
  operating_percent: number
  qris_bank: string
  qris_owner_name: string
  qris_image: string | null
  qris_image_url: string | null
}

export type SettingsPayload = Omit<AdminSettings, 'settings_id' | 'qris_image_url'>

const settingsQuery = () => supabase
  .from('admin_settings')
  .select('settings_id, business_name, business_address, table_count, receipt_footer, operating_percent, qris_bank, qris_owner_name, qris_image')
  .eq('settings_id', 1)
  .single()

function parseSettings(value: unknown): Omit<AdminSettings, 'qris_image_url'> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(id.settings.loadError)
  const row = value as Record<string, unknown>
  if (
    !Number.isSafeInteger(Number(row.settings_id)) ||
    typeof row.business_name !== 'string' ||
    (row.business_address !== null && typeof row.business_address !== 'string') ||
    !Number.isSafeInteger(Number(row.table_count)) ||
    (row.receipt_footer !== null && typeof row.receipt_footer !== 'string') ||
    !Number.isFinite(Number(row.operating_percent)) ||
    (row.qris_bank !== null && typeof row.qris_bank !== 'string') ||
    (row.qris_owner_name !== null && typeof row.qris_owner_name !== 'string') ||
    (row.qris_image !== null && typeof row.qris_image !== 'string')
  ) {
    throw new Error(id.settings.loadError)
  }

  return {
    settings_id: Number(row.settings_id),
    business_name: row.business_name,
    business_address: typeof row.business_address === 'string' ? row.business_address : '',
    table_count: Number(row.table_count),
    receipt_footer: typeof row.receipt_footer === 'string' ? row.receipt_footer : '',
    operating_percent: Number(row.operating_percent),
    qris_bank: typeof row.qris_bank === 'string' ? row.qris_bank : '',
    qris_owner_name: typeof row.qris_owner_name === 'string' ? row.qris_owner_name : '',
    qris_image: typeof row.qris_image === 'string' ? row.qris_image : null,
  }
}

function isSafeQrisPath(path: string | null): path is string {
  return Boolean(path && /^qris\/[A-Za-z0-9._-]+$/.test(path))
}

async function signedQrisUrl(path: string | null): Promise<string | null> {
  if (!isSafeQrisPath(path)) return null
  const { data, error } = await supabase.storage.from('qris').createSignedUrl(path, 3_600)
  return error ? null : data.signedUrl
}

export async function fetchAdminSettings(): Promise<AdminSettings> {
  const { data, error } = await settingsQuery()
  if (error) throw error
  const settings = parseSettings(data)
  return { ...settings, qris_image_url: await signedQrisUrl(settings.qris_image) }
}

const settingsFormSchema = z.object({
  business_name: z.string().trim().min(1, id.settings.validation.businessName).max(100, id.settings.validation.businessNameLength),
  business_address: z.string().trim().max(200, id.settings.validation.addressLength),
  table_count: z.string().trim().regex(/^\d+$/, id.settings.validation.tableCount).transform(Number).pipe(z.number().int().min(1, id.settings.validation.tableCount)),
  receipt_footer: z.string().trim().max(200, id.settings.validation.footerLength),
  operating_percent: z.string().trim().regex(/^\d{1,3}(?:\.\d{1,2})?$/, id.settings.validation.operatingPercent).transform(Number).pipe(z.number().min(0).max(100)),
  qris_bank: z.string().trim().max(50, id.settings.validation.bankLength),
  qris_owner_name: z.string().trim().max(100, id.settings.validation.ownerLength),
})

export type SettingsFormValues = z.input<typeof settingsFormSchema>

export function validateSettingsForm(values: SettingsFormValues): SettingsPayload {
  const parsed = settingsFormSchema.safeParse(values)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? id.settings.validation.invalid)
  return {
    business_name: parsed.data.business_name,
    business_address: parsed.data.business_address,
    table_count: parsed.data.table_count,
    receipt_footer: parsed.data.receipt_footer,
    operating_percent: parsed.data.operating_percent,
    qris_bank: parsed.data.qris_bank,
    qris_owner_name: parsed.data.qris_owner_name,
    qris_image: null,
  }
}

function extensionFor(file: File): string {
  if (file.type === 'image/jpeg') return 'jpg'
  if (file.type === 'image/png') return 'png'
  throw new Error(id.settings.validation.fileType)
}

export async function saveAdminSettings(payload: SettingsPayload, file: File | null, currentImage: string | null): Promise<AdminSettings> {
  if (file && file.size > 2_097_152) throw new Error(id.settings.validation.fileSize)
  let nextImage = currentImage
  let uploadedImage: string | null = null

  if (file) {
    const extension = extensionFor(file)
    uploadedImage = `qris/${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await supabase.storage.from('qris').upload(uploadedImage, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    })
    if (uploadError) throw uploadError
    nextImage = uploadedImage
  }

  const { data, error } = await supabase.rpc('admin_update_settings', {
    p_business_name: payload.business_name,
    p_business_address: payload.business_address || null,
    p_table_count: payload.table_count,
    p_receipt_footer: payload.receipt_footer || null,
    p_operating_percent: payload.operating_percent,
    p_qris_bank: payload.qris_bank || null,
    p_qris_owner_name: payload.qris_owner_name || null,
    p_qris_image: nextImage,
  })

  if (error) {
    if (uploadedImage) await supabase.storage.from('qris').remove([uploadedImage])
    throw error
  }

  const saved = parseSettings(data)
  if (uploadedImage && isSafeQrisPath(currentImage) && currentImage !== uploadedImage) {
    await supabase.storage.from('qris').remove([currentImage])
  }

  return { ...saved, qris_image_url: await signedQrisUrl(saved.qris_image) }
}
