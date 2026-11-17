import { formatInTimeZone } from 'date-fns-tz'
import { id } from '@/lib/i18n/id'

const WIB_TIME_ZONE = 'Asia/Jakarta'
const rupiahFormatter = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })

export function formatRupiah(amount: number): string {
  const safeAmount = Number.isFinite(amount) ? Math.trunc(amount) : 0
  return `Rp${rupiahFormatter.format(safeAmount)}`
}

export function formatSignedRupiah(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return formatRupiah(0)
  return `${amount < 0 ? '-' : '+'}${formatRupiah(Math.abs(Math.trunc(amount)))}`
}

export function currentWibDate(): string {
  return formatInTimeZone(new Date(), WIB_TIME_ZONE, 'yyyy-MM-dd')
}

export function formatDateWib(value: Date | number | string): string {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? formatInTimeZone(date, WIB_TIME_ZONE, 'dd/MM/yyyy') : '—'
}

export function formatDateTimeWib(value: Date | number | string, withSeconds = false): string {
  const date = value instanceof Date ? value : new Date(value)

  if (!Number.isFinite(date.getTime())) {
    return '—'
  }

  const pattern = withSeconds ? 'dd/MM/yyyy HH:mm:ss' : 'dd/MM/yyyy HH:mm'
  return `${formatInTimeZone(date, WIB_TIME_ZONE, pattern)} ${id.wib}`
}

const numberWords = [
  'nol',
  'satu',
  'dua',
  'tiga',
  'empat',
  'lima',
  'enam',
  'tujuh',
  'delapan',
  'sembilan',
  'sepuluh',
  'sebelas',
]

function spellPositiveInteger(value: number): string {
  if (value < numberWords.length) {
    return numberWords[value]
  }

  if (value < 20) {
    return `${spellPositiveInteger(value - 10)} belas`
  }

  if (value < 100) {
    const tens = Math.floor(value / 10)
    const remainder = value % 10
    return [numberWords[tens], 'puluh', remainder ? spellPositiveInteger(remainder) : ''].filter(Boolean).join(' ')
  }

  if (value < 200) {
    const remainder = value - 100
    return ['seratus', remainder ? spellPositiveInteger(remainder) : ''].filter(Boolean).join(' ')
  }

  if (value < 1_000) {
    const hundreds = Math.floor(value / 100)
    const remainder = value % 100
    return [numberWords[hundreds], 'ratus', remainder ? spellPositiveInteger(remainder) : ''].filter(Boolean).join(' ')
  }

  if (value < 2_000) {
    const remainder = value - 1_000
    return ['seribu', remainder ? spellPositiveInteger(remainder) : ''].filter(Boolean).join(' ')
  }

  const scales = [
    { value: 1_000_000_000_000, label: 'triliun' },
    { value: 1_000_000_000, label: 'miliar' },
    { value: 1_000_000, label: 'juta' },
    { value: 1_000, label: 'ribu' },
  ]
  const scale = scales.find(({ value: scaleValue }) => value >= scaleValue)

  if (!scale) {
    return String(value)
  }

  const quantity = Math.floor(value / scale.value)
  const remainder = value % scale.value
  return [spellPositiveInteger(quantity), scale.label, remainder ? spellPositiveInteger(remainder) : ''].filter(Boolean).join(' ')
}

export function terbilang(value: number): string {
  if (!Number.isFinite(value)) {
    return 'nol'
  }

  const integer = Math.trunc(value)

  if (integer < 0) {
    return `minus ${spellPositiveInteger(Math.abs(integer))}`
  }

  return spellPositiveInteger(integer)
}
