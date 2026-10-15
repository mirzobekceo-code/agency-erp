import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { api, errorText, type Paginated, type Row } from '../api'
import { Modal, PageHead, invalidateRefs, refLabel, useRefOptions } from './ui'

export type FieldType =
  | 'text' | 'textarea' | 'number' | 'money' | 'date' | 'datetime' | 'email' | 'url' | 'select' | 'ref' | 'multiref'
  | 'password' | 'checkbox' | 'file'

export interface Field {
  name: string
  label: string
  type?: FieldType
  options?: Record<string, string>
  /** 'ref' / 'multiref' uchun API manzil, masalan '/clients/' */
  ref?: string
  required?: boolean
  default?: unknown
  /** Faqat yangi yozuv yaratishda ko'rsatiladi */
  createOnly?: boolean
  full?: boolean
}

export interface Column {
  key: string
  label: string
  render?: (row: Row) => ReactNode
  align?: 'right'
}

export interface Filter {
  name: string
  label: string
  options?: Record<string, string>
  ref?: string
}

interface Props {
  title: string
  endpoint: string
  fields: Field[]
  columns: Column[]
  filters?: Filter[]
  canEdit?: boolean
  canCreate?: boolean
  rowActions?: (row: Row, reload: () => void) => ReactNode
  defaultParams?: Record<string, string>
  ordering?: string
  /** Yozuvga bosilganda tahrirlash o'rniga boshqa amal */
  onRowClick?: (row: Row) => void
  headerExtra?: ReactNode
}

export default function CrudPage(p: Props) {
  const [data, setData] = useState<Paginated<Row> | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<Row | null>(null)
  const [error, setError] = useState('')
  const canEdit = p.canEdit ?? true
  const canCreate = p.canCreate ?? canEdit

  const load = useCallback(async () => {
    try {
      const params: Record<string, string | number> = { page, ...p.defaultParams }
      if (search) params.search = search
      if (p.ordering) params.ordering = p.ordering
      for (const [k, v] of Object.entries(filters)) if (v) params[k] = v
      setData((await api.get<Paginated<Row>>(p.endpoint, { params })).data)
      setError('')
    } catch (e) {
      setError(errorText(e))
    }
  }, [p.endpoint, p.ordering, p.defaultParams, page, search, filters])

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, search])

  const remove = async (row: Row) => {
    if (!confirm("Rostdan ham o'chirmoqchimisiz?")) return
    try {
      await api.delete(`${p.endpoint}${row.id}/`)
      invalidateRefs(p.endpoint)
      load()
    } catch (e) {
      alert(errorText(e))
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.count / 50)) : 1

  return (
    <>
      <PageHead title={p.title}>
        {p.headerExtra}
        {canCreate && <button className="btn btn-primary" onClick={() => setEditing({})}>+ Qo'shish</button>}
      </PageHead>

      <div className="toolbar">
        <input
          className="input search" placeholder="Qidirish…" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
        {p.filters?.map((f) => (
          <FilterSelect key={f.name} f={f} value={filters[f.name] ?? ''}
            onChange={(v) => { setFilters((s) => ({ ...s, [f.name]: v })); setPage(1) }} />
        ))}
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {p.columns.map((c) => <th key={c.key} className={c.align === 'right' ? 'r' : ''}>{c.label}</th>)}
              {(canEdit || p.rowActions) && <th />}
            </tr>
          </thead>
          <tbody>
            {data?.results.map((row) => (
              <tr key={row.id} className={canEdit || p.onRowClick ? 'clickable' : ''}
                onClick={() => (p.onRowClick ? p.onRowClick(row) : canEdit && setEditing(row))}>
                {p.columns.map((c) => (
                  <td key={c.key} className={c.align === 'right' ? 'r' : ''}>
                    {c.render ? c.render(row) : (row[c.key] ?? '—')}
                  </td>
                ))}
                {(canEdit || p.rowActions) && (
                  <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                    {p.rowActions?.(row, load)}
                    {canEdit && <button className="btn-link danger" onClick={() => remove(row)}>O'chirish</button>}
                  </td>
                )}
              </tr>
            ))}
            {data && data.results.length === 0 && (
              <tr><td colSpan={p.columns.length + 1} className="empty">Ma'lumot yo'q</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.count > 50 && (
        <div className="pager">
          <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Oldingi</button>
          <span>{page} / {pages} (jami {data.count})</span>
          <button className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>Keyingi →</button>
        </div>
      )}

      {editing && (
        <RecordForm
          title={editing.id ? `${p.title}: tahrirlash` : `${p.title}: yangi`}
          endpoint={p.endpoint} fields={p.fields} initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); invalidateRefs(p.endpoint); load() }}
        />
      )}
    </>
  )
}

function FilterSelect({ f, value, onChange }: { f: Filter; value: string; onChange: (v: string) => void }) {
  const refs = useRefOptions(f.ref)
  const opts = f.options ? Object.entries(f.options) : refs.map((r) => [String(r.id), refLabel(r)])
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{f.label}: barchasi</option>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

/** Yozuvni yaratish/tahrirlash formasi — boshqa sahifalarda ham ishlatiladi. */
export function RecordForm({ title, endpoint, fields, initial, onClose, onSaved }: {
  title: string; endpoint: string; fields: Field[]; initial: Row; onClose: () => void; onSaved: (r: Row) => void
}) {
  const isNew = !initial.id
  const [values, setValues] = useState<Row>(() => {
    const v: Row = {}
    for (const f of fields) {
      const cur = initial[f.name]
      if (cur !== undefined && cur !== null) v[f.name] = f.type === 'datetime' ? toLocalInput(cur) : cur
      else v[f.name] = f.default ?? (f.type === 'multiref' ? [] : f.type === 'checkbox' ? false : '')
    }
    return v
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const hasFile = fields.some((f) => values[f.name] instanceof File)
    const payload: Row = {}
    for (const f of fields) {
      if (f.createOnly && !isNew) continue
      let v = values[f.name]
      if (f.type === 'password' && !v) continue
      if (f.type === 'file' && !(v instanceof File)) continue
      if (v === '' && ['ref', 'date', 'datetime', 'number', 'money'].includes(f.type ?? '')) v = null
      if (f.type === 'datetime' && v) v = new Date(v).toISOString()
      payload[f.name] = v
    }
    try {
      let body: Row | FormData = payload
      if (hasFile) {
        const fd = new FormData()
        for (const [k, v] of Object.entries(payload)) if (v !== null && v !== undefined) fd.append(k, v)
        body = fd
      }
      const r = isNew ? await api.post(endpoint, body) : await api.patch(`${endpoint}${initial.id}/`, body)
      onSaved(r.data)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  const set = (name: string, v: unknown) => setValues((s) => ({ ...s, [name]: v }))

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <div className="form-grid">
          {fields.filter((f) => !(f.createOnly && !isNew)).map((f) => (
            <label key={f.name} className={`field ${f.full || f.type === 'textarea' || f.type === 'multiref' ? 'full' : ''}`}>
              <span>{f.label}{f.required && ' *'}</span>
              <FieldInput f={f} value={values[f.name]} onChange={(v) => set(f.name, v)} />
            </label>
          ))}
        </div>
        {error && <div className="alert pre">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Bekor qilish</button>
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Saqlanmoqda…' : 'Saqlash'}</button>
        </div>
      </form>
    </Modal>
  )
}

function FieldInput({ f, value, onChange }: { f: Field; value: Row[string]; onChange: (v: unknown) => void }) {
  const refs = useRefOptions(f.type === 'ref' || f.type === 'multiref' ? f.ref : undefined)
  switch (f.type) {
    case 'textarea':
      return <textarea className="input" rows={3} value={value} required={f.required} onChange={(e) => onChange(e.target.value)} />
    case 'select':
      return (
        <select className="input" value={value} required={f.required} onChange={(e) => onChange(e.target.value)}>
          {!f.required && <option value="">—</option>}
          {Object.entries(f.options ?? {}).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      )
    case 'ref':
      return (
        <select className="input" value={value ?? ''} required={f.required} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}>
          <option value="">—</option>
          {refs.map((r) => <option key={r.id} value={r.id}>{refLabel(r)}</option>)}
        </select>
      )
    case 'multiref': {
      const sel: number[] = value ?? []
      return (
        <div className="chips">
          {refs.map((r) => (
            <button type="button" key={r.id} className={`chip ${sel.includes(r.id) ? 'on' : ''}`}
              onClick={() => onChange(sel.includes(r.id) ? sel.filter((x) => x !== r.id) : [...sel, r.id])}>
              {refLabel(r)}
            </button>
          ))}
        </div>
      )
    }
    case 'file':
      return (
        <>
          {typeof value === 'string' && value && <a href={value} target="_blank">Joriy fayl</a>}
          <input className="input" type="file" onChange={(e) => onChange(e.target.files?.[0] ?? '')} />
        </>
      )
    case 'checkbox':
      return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
    default: {
      const types: Partial<Record<FieldType, string>> = { money: 'number', number: 'number', date: 'date', datetime: 'datetime-local', email: 'email', url: 'url', password: 'password' }
      const type = (f.type && types[f.type]) || 'text'
      return (
        <input className="input" type={type} value={value ?? ''} required={f.required}
          step={f.type === 'money' ? '1000' : f.type === 'number' ? 'any' : undefined} min={f.type === 'money' ? 0 : undefined}
          onChange={(e) => onChange(e.target.value)} />
      )
    }
  }
}

function toLocalInput(iso: string) {
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
