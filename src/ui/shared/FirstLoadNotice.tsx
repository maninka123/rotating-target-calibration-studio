import { useEffect, useRef } from 'react'

interface Props {
  open: boolean
  onClose: () => void
}

export function FirstLoadNotice({ open, onClose }: Props) {
  const dialog = useRef<HTMLDivElement>(null)
  const continueButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    continueButton.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = dialog.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (focusable.length === 1 || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="notice-backdrop">
      <div className="first-load-notice" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="work-in-progress-title" aria-describedby="work-in-progress-body">
        <svg className="notice-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.2 22 20.5H2L12 3.2Z" />
          <path d="M12 8v6.2M12 17.5v.2" />
        </svg>
        <div>
          <h2 id="work-in-progress-title">Work in progress</h2>
          <p id="work-in-progress-body">This standalone browser simulation uses idealised sampling and a noise-free scene, so results may differ from physical sensors.</p>
        </div>
        <button ref={continueButton} className="notice-continue" type="button" onClick={onClose}>Continue</button>
      </div>
    </div>
  )
}
