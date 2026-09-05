import { useState, type PropsWithChildren, type ReactNode } from 'react'

interface PanelProps extends PropsWithChildren {
  number: number
  title: string
  actions?: ReactNode
  className?: string
}

export function Panel({ number, title, actions, className = '', children }: PanelProps) {
  const [open, setOpen] = useState(true)
  return (
    <section className={`panel ${className}`} data-panel={number}>
      <header className="panel-header">
        <button className="panel-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          <span className="panel-number">{number}</span>
          <span>{title}</span>
          <span className="chevron">{open ? '−' : '+'}</span>
        </button>
        {actions && <div className="panel-actions">{actions}</div>}
      </header>
      {open && <div className="panel-body">{children}</div>}
    </section>
  )
}
