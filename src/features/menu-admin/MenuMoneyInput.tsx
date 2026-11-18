import type { ChangeEvent } from 'react'
import { formatRupiahInput } from '@/lib/format'

type MenuMoneyInputProps = {
  value: string
  label: string
  onChange: (value: string) => void
  required?: boolean
}

export function MenuMoneyInput({ value, label, onChange, required = true }: MenuMoneyInputProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const formatted = formatRupiahInput(input.value, input.selectionStart ?? input.value.length)
    onChange(formatted.value)
    requestAnimationFrame(() => input.setSelectionRange(formatted.caretPosition, formatted.caretPosition))
  }

  return (
    <span className="menu-money-input">
      <span aria-hidden="true">Rp</span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={handleChange}
        required={required}
        aria-label={label}
      />
    </span>
  )
}
