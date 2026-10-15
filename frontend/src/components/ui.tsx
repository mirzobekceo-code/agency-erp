import { useEffect, useState, type ReactNode } from 'react'
import { api, type Paginated, type Row } from '../api'
import { tone } from '../labels'

export function Badge({ value, label }: { value: string; label?: string }) {
  return <span className={`badge badge-${tone[value] ?? 'muted'}`}>{label ?? value}</span>
}

export function Modal({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} onMouseDown={(e) => e.stopPropagation()} role="dialog">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Yopish">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Stat({ label, value, hint, tone: t }: { label: string; value: ReactNode; hint?: ReactNode; tone?: string }) {
  return (
    <div className={`stat ${t ? `stat-${t}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  )
}

export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      <div className="page-actions">{children}</div>
    </div>
  )
}

const refCache = new Map<string, Promise<Row[]>>()

/** Tanlash ro'yxatlari uchun bog'langan obyektlarni yuklaydi (keshlangan). */
export function useRefOptions(endpoint?: string, version = 0) {
  const [rows, setRows] = useState<Row[]>([])
  useEffect(() => {
    if (!endpoint) return
    const key = `${endpoint}#${version}`
    if (!refCache.has(key)) {
      refCache.set(key, api.get<Paginated<Row>>(endpoint, { params: { page_size: 1000 } }).then((r) => r.data.results))
    }
    let alive = true
    refCache.get(key)!.then((r) => alive && setRows(r)).catch(() => refCache.delete(key))
    return () => { alive = false }
  }, [endpoint, version])
  return rows
}

export function invalidateRefs(endpoint: string) {
  for (const k of refCache.keys()) if (k.startsWith(endpoint)) refCache.delete(k)
}

export const refLabel = (r: Row) => r.full_name ?? r.name ?? r.title ?? r.number ?? `#${r.id}`
