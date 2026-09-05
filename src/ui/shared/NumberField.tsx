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
  return (
    <label className="field">
      <span>{label}</span>
      <span className="input-unit">
        <input
          type="number"
          value={Number.isFinite(value) ? value : ''}
          min={min}
          max={max}
          step={step}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {unit && <small>{unit}</small>}
      </span>
    </label>
  )
}
