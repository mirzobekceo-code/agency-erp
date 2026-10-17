import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, errorText, type Paginated, type Row } from '../api'
import { PageHead, useRefOptions } from '../components/ui'
import { L } from '../labels'
import { PostForm } from './Studio'

const WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya']
const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr']


const pad = (n: number) => String(n).padStart(2, '0')
const localKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export default function ContentPage() {
  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [posts, setPosts] = useState<Row[]>([])
  const [shoots, setShoots] = useState<Row[]>([])
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
      // Nashr kunlari + shu oraliqdagi syomkalar
      const [pub, shoot] = await Promise.all([
        api.get<Paginated<Row>>('/posts/', { params }),
        api.get<Paginated<Row>>('/posts/', { params: { page_size: 1000, include_published: '1', shoot_at__gte: params.publish_at__gte, shoot_at__lte: params.publish_at__lte, ...(project ? { project } : {}) } }),
      ])
      setPosts(pub.data.results)
      setShoots(shoot.data.results.filter((p) => p.shoot_at))
    } catch (e) { setError(errorText(e)) }
  }, [days, project])

  useEffect(() => { load() }, [load])

  const byDay = useMemo(() => {
    const m = new Map<string, Row[]>()
    for (const p of posts) {
      if (!p.publish_at) continue
      const k = localKey(new Date(p.publish_at))
      m.set(k, [...(m.get(k) ?? []), { ...p, _kind: 'publish', _at: p.publish_at }])
    }
    for (const p of shoots) {
      const k = localKey(new Date(p.shoot_at))
      m.set(k, [...(m.get(k) ?? []), { ...p, _kind: 'shoot', _at: p.shoot_at }])
    }
    for (const [k, v] of m) m.set(k, v.sort((a, b) => a._at.localeCompare(b._at)))
    return m
  }, [posts, shoots])

  const shift = (n: number) => setYm(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }))
  const todayKey = localKey(new Date())

  return (
    <>
      <PageHead title="Kalendar">
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
                <button key={`${p._kind}-${p.id}`} className={`cal-item st-${p.status} ${p._kind === 'shoot' ? 'cal-shoot' : ''}`} onClick={() => setEditing(p)}
                  title={`${p._kind === 'shoot' ? 'Syomka' : 'Nashr'} · ${p.project_name} · ${p.content_type_display} · ${p.status_display}`}>
                  <span className="cal-time">{p._kind === 'shoot' ? '🎥 ' : ''}{new Date(p._at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
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
        <span>🎥 — syomka kuni</span>
        <span className="muted small">Kunga ikki marta bosib yangi kontent qo'shish mumkin</span>
      </div>

      {editing && <PostForm post={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </>
  )
}
