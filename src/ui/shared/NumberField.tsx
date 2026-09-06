import { useEffect, useState } from 'react'

interface NumberFieldProps {
  label: string
  value: number
  unit?: string
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
}

export function NumberField({ label, value, unit, min, max, step = 1, onChange }: NumberFieldProps) {
  const [raw, setRaw] = useState(String(value))
  useEffect(() => setRaw(String(value)), [value])
  const parsed = Number(raw)
  const valid = raw.trim() !== '' && Number.isFinite(parsed) && (min === undefined || parsed >= min) && (max === undefined || parsed <= max)
  return (
    <label className={`field ${valid ? '' : 'invalid'}`}>
      <span>{label}</span>
      <span className="input-unit">
        <input
          type="number"
          value={raw}
          min={min}
          max={max}
          step={step}
          onChange={(event) => { const next = event.target.value; setRaw(next); const number = Number(next); if (next.trim() && Number.isFinite(number) && (min === undefined || number >= min) && (max === undefined || number <= max)) onChange(number) }}
          aria-invalid={!valid}
        />
        {unit && <small>{unit}</small>}
      </span>
      {!valid && <small className="field-error">Enter a valid value.</small>}
    </label>
  )
}
