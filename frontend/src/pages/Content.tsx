import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, errorText, type Paginated, type Row } from '../api'
import { RecordForm, type Field } from '../components/CrudPage'
import { PageHead, useRefOptions } from '../components/ui'
import { L } from '../labels'

const WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya']
const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr']

const fields: Field[] = [
  { name: 'title', label: 'Sarlavha', required: true, full: true },
  { name: 'project', label: 'Loyiha', type: 'ref', ref: '/projects/', required: true },
  { name: 'assignee', label: "Mas'ul", type: 'ref', ref: '/users/' },
  { name: 'platform', label: 'Platforma', type: 'select', options: L.postPlatform, required: true, default: 'instagram' },
  { name: 'content_type', label: 'Turi', type: 'select', options: L.postType, required: true, default: 'post' },
  { name: 'publish_at', label: "E'lon vaqti", type: 'datetime' },
  { name: 'status', label: 'Holat', type: 'select', options: L.postStatus, required: true, default: 'idea' },
  { name: 'caption', label: 'Matn', type: 'textarea' },
  { name: 'media_url', label: 'Media havolasi (Drive, Figma…)', type: 'url', full: true },
  { name: 'post_url', label: "E'lon qilingan havola", type: 'url', full: true },
  { name: 'reach', label: 'Qamrov', type: 'number', default: 0 },
  { name: 'engagement', label: 'Faollik', type: 'number', default: 0 },
]

const pad = (n: number) => String(n).padStart(2, '0')
const localKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export default function ContentPage() {
  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [posts, setPosts] = useState<Row[]>([])
  const [project, setProject] = useState('')
  const [editing, setEditing] = useState<Row | null>(null)
  const [error, setError] = useState('')
  const projects = useRefOptions('/projects/')

  // Kalendar to'ri: dushanbadan boshlanadigan 6 hafta.
  const days = useMemo(() => {
    const first = new Date(ym.y, ym.m, 1)
    const start = new Date(first)
    start.setDate(1 - ((first.getDay() + 6) % 7))
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }, [ym])

  const load = useCallback(async () => {
    const params: Record<string, string | number> = {
      page_size: 1000,
      publish_at__gte: days[0].toISOString(),
      publish_at__lte: new Date(days[41].getTime() + 86400000).toISOString(),
    }
    if (project) params.project = project
    try {
      setPosts((await api.get<Paginated<Row>>('/posts/', { params })).data.results)
    } catch (e) { setError(errorText(e)) }
  }, [days, project])

  useEffect(() => { load() }, [load])

  const byDay = useMemo(() => {
    const m = new Map<string, Row[]>()
    for (const p of posts) {
      if (!p.publish_at) continue
      const k = localKey(new Date(p.publish_at))
      m.set(k, [...(m.get(k) ?? []), p])
    }
    return m
  }, [posts])

  const shift = (n: number) => setYm(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }))
  const todayKey = localKey(new Date())

  return (
    <>
      <PageHead title="Kontent-reja">
        <button className="btn btn-primary" onClick={() => setEditing({})}>+ Kontent</button>
      </PageHead>
      <div className="toolbar">
        <button className="btn" onClick={() => shift(-1)}>←</button>
        <strong className="month-title">{MONTHS[ym.m]} {ym.y}</strong>
        <button className="btn" onClick={() => shift(1)}>→</button>
        <button className="btn" onClick={() => setYm({ y: now.getFullYear(), m: now.getMonth() })}>Bugun</button>
        <select className="input" value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="">Loyiha: barchasi</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {error && <div className="alert">{error}</div>}

      <div className="calendar">
        {WEEKDAYS.map((w) => <div key={w} className="cal-wd">{w}</div>)}
        {days.map((d) => {
          const k = localKey(d)
          const items = byDay.get(k) ?? []
          return (
            <div key={k} className={`cal-day ${d.getMonth() !== ym.m ? 'other' : ''} ${k === todayKey ? 'today' : ''}`}
              onDoubleClick={() => setEditing({ publish_at: `${k}T10:00:00` })}>
              <div className="cal-num">{d.getDate()}</div>
              {items.map((p) => (
                <button key={p.id} className={`cal-item st-${p.status}`} onClick={() => setEditing(p)}
                  title={`${p.client_name} · ${p.platform_display} · ${p.status_display}`}>
                  <span className="cal-time">{new Date(p.publish_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                  {p.title}
                </button>
              ))}
            </div>
          )
        })}
      </div>
      <div className="legend">
        {(Object.keys(L.postStatus) as (keyof typeof L.postStatus)[]).map((s) => (
          <span key={s}><i className={`dot st-${s}`} />{L.postStatus[s]}</span>
        ))}
        <span className="muted small">Kunga ikki marta bosib yangi kontent qo'shish mumkin</span>
      </div>

      {editing && (
        <RecordForm title={editing.id ? 'Kontentni tahrirlash' : 'Yangi kontent'} endpoint="/posts/" fields={fields}
          initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      )}
    </>
  )
}
