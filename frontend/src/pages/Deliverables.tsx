import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, errorText, type Paginated, type Row } from '../api'
import { useAuth } from '../auth'
import { RecordForm, type Field } from '../components/CrudPage'
import { Badge, PageHead } from '../components/ui'
import { L, relDay } from '../labels'

const STATE: Record<string, { label: string; tone: string }> = {
  done: { label: 'Bajarildi', tone: 'done' },
  late: { label: "Muddati o'tdi", tone: 'cancelled' },
  behind: { label: 'Orqada', tone: 'review' },
  ok: { label: "Reja bo'yicha", tone: 'in_progress' },
}

const fields = (projectId?: number): Field[] => [
  { name: 'project', label: 'Loyiha', type: 'ref', ref: '/projects/', required: true, hidden: !!projectId },
  { name: 'title', label: 'Majburiyat (masalan: Reels, Post, Syomka, Oylik hisobot)', required: true, full: true },
  { name: 'quantity', label: 'Reja (soni)', type: 'number', required: true, default: 1 },
  { name: 'content_type', label: "Kontent studiodagi nashrlardan avtomatik sanash", type: 'select', options: L.postType },
  { name: 'period_start', label: 'Davr boshi', type: 'date' },
  { name: 'due_date', label: 'Muddat', type: 'date' },
  { name: 'responsible', label: "Mas'ul", type: 'ref', ref: '/users/' },
  { name: 'done', label: "Bajarildi (qo'lda qo'shimcha)", type: 'number', default: 0 },
  { name: 'note', label: 'Izoh', full: true },
]

/** Majburiyatlar ro'yxati: loyiha sahifasida (projectId bilan) yoki umumiy sahifada. */
export function DeliverableList({ projectId }: { projectId?: number }) {
  const { can } = useAuth()
  const canEdit = can('manager', 'sales')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [editing, setEditing] = useState<Row | null>(null)
  const [error, setError] = useState('')
  const [onlyOpen, setOnlyOpen] = useState(true)

  const load = useCallback(() => {
    const params: Record<string, string | number> = { page_size: 500 }
    if (projectId) params.project = projectId
    else params.active = 1
    api.get<Paginated<Row>>('/deliverables/', { params })
      .then((r) => { setRows(r.data.results); setError('') }).catch((e) => setError(errorText(e)))
  }, [projectId])
  useEffect(() => { load() }, [load])

  const bump = async (r: Row) => {
    try { await api.patch(`/deliverables/${r.id}/`, { done: r.done + 1 }); load() } catch (e) { alert(errorText(e)) }
  }

  const shown = (rows ?? []).filter((r) => !onlyOpen || r.state !== 'done')
  const counts: Record<string, number> = {}
  for (const r of rows ?? []) counts[r.state] = (counts[r.state] ?? 0) + 1

  return (
    <div>
      <div className="toolbar">
        <div className="pills">
          {(['late', 'behind', 'ok', 'done'] as const).map((k) => counts[k] ? (
            <span key={k} className={`badge badge-${k === 'late' ? 'bad' : k === 'behind' ? 'warn' : k === 'done' ? 'good' : 'info'}`}>
              {STATE[k].label}: {counts[k]}
            </span>
          ) : null)}
        </div>
        <label className="inline on-bg"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Faqat bajarilmaganlar</label>
        {canEdit && <button className="btn btn-primary" onClick={() => setEditing({ project: projectId, quantity: 1, done: 0 })}>+ Majburiyat</button>}
      </div>
      {error && <div className="alert">{error}</div>}
      {rows === null ? <div className="muted">Yuklanmoqda…</div> : shown.length === 0 ? (
        <div className="card empty">
          {rows.length ? 'Hammasi bajarilgan 🎉' : "Hali majburiyat kiritilmagan. Mijoz bilan kelishilgan ishlarni (masalan, oyiga 12 post, 8 reels, 2 syomka) shu yerga yozing — tizim muddat va bajarilishini kuzatib boradi."}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {!projectId && <th>Loyiha</th>}
                <th>Majburiyat</th><th>Bajarilishi</th><th>Muddat</th><th>Mas'ul</th><th>Holat</th>{canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const pct = Math.min(100, Math.round((r.done_count / Math.max(r.quantity, 1)) * 100))
                const due = relDay(r.due_date)
                return (
                  <tr key={r.id} className={canEdit ? 'clickable' : ''} onClick={() => canEdit && setEditing(r)}>
                    {!projectId && <td><Link to={`/projects/${r.project}`} onClick={(e) => e.stopPropagation()}>{r.project_name}</Link><div className="muted small">{r.client_name}</div></td>}
                    <td>
                      <b>{r.title}</b>
                      {r.content_type && <div className="muted small">Avto: {L.postType[r.content_type as keyof typeof L.postType]} nashrlari</div>}
                      {r.note && <div className="muted small">{r.note}</div>}
                    </td>
                    <td style={{ minWidth: 140 }}>
                      <div className="bar"><i style={{ width: `${pct}%` }} className={r.state === 'late' ? 'bad' : r.state === 'behind' ? 'warn' : r.state === 'done' ? 'good' : ''} /></div>
                      <span className="small">{r.done_count} / {r.quantity}</span>
                    </td>
                    <td className={r.state === 'done' ? 'muted' : due.tone}>{due.text}</td>
                    <td>{r.responsible_name ?? <span className="muted">—</span>}</td>
                    <td><Badge value={STATE[r.state].tone} label={STATE[r.state].label} /></td>
                    {canEdit && (
                      <td onClick={(e) => e.stopPropagation()}>
                        {r.state !== 'done' && <button className="btn btn-sm" title="Bittasi bajarildi" onClick={() => bump(r)}>+1</button>}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <RecordForm title={editing.id ? 'Majburiyatni tahrirlash' : 'Yangi majburiyat'} endpoint="/deliverables/"
          fields={fields(projectId)} initial={editing}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      )}
    </div>
  )
}

export default function DeliverablesPage() {
  return (
    <>
      <PageHead title="Majburiyatlar" />
      <p className="muted">Har bir loyihada mijoz oldida nimalarga javob berishimiz va muddatlari. Orqada qolganlari bosh sahifada ham ko'rinadi.</p>
      <DeliverableList />
    </>
  )
}
