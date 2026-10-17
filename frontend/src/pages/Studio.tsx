import { useCallback, useEffect, useState } from 'react'
import { api, errorText, type Paginated, type Row } from '../api'
import { RecordForm, type Field } from '../components/CrudPage'
import { PageHead, useRefOptions } from '../components/ui'
import { L, fmtDateTime } from '../labels'

/** Ishlab chiqarish bosqichlari tartibi (nashr qilinganidan tashqari). */
export const STAGES = ['idea', 'script', 'shoot', 'edit', 'design', 'review', 'ready'] as const
const ALL_STAGES = [...STAGES, 'published'] as const
const STAGE_LABEL = L.postStatus as Record<string, string>
const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr']

/** Kontent formasi — Kalendar sahifasida ham ishlatiladi. */
export const postFields: Field[] = [
  { name: 'title', label: 'Sarlavha', required: true, full: true },
  { name: 'project', label: 'Loyiha', type: 'ref', ref: '/projects/', required: true },
  { name: 'status', label: 'Bosqich', type: 'select', options: L.postStatus, required: true, default: 'idea' },
  { name: 'content_type', label: 'Format', type: 'select', options: L.postType, required: true, default: 'reels' },
  { name: 'platform', label: 'Platforma', type: 'select', options: L.postPlatform, required: true, default: 'instagram' },
  { name: 'assignee', label: 'SMM (mas\'ul)', type: 'ref', ref: '/users/' },
  { name: 'operator', label: 'Video operator', type: 'ref', ref: '/users/' },
  { name: 'editor', label: 'Montajor', type: 'ref', ref: '/users/' },
  { name: 'designer', label: 'Dizayner', type: 'ref', ref: '/users/' },
  { name: 'shoot_at', label: 'Syomka vaqti', type: 'datetime' },
  { name: 'edit_deadline', label: 'Montaj / dizayn muddati', type: 'date' },
  { name: 'publish_at', label: 'Nashr vaqti', type: 'datetime' },
  { name: 'script', label: 'Ssenariy', type: 'textarea' },
  { name: 'caption', label: 'Post matni', type: 'textarea' },
  { name: 'media_url', label: 'Media havolasi (Drive, Figma…)', type: 'url', full: true },
  { name: 'review_note', label: 'Tasdiq izohi (mijoz / PM fikri)', type: 'textarea' },
  { name: 'post_url', label: 'Nashr qilingan havola', type: 'url', full: true },
  { name: 'reach', label: 'Qamrov', type: 'number', default: 0 },
  { name: 'engagement', label: 'Faollik (like + komment)', type: 'number', default: 0 },
]

const TABS: [string, string][] = [['all', 'Barchasi'], ['mine', 'Mening navbatim'], ['week', 'Shu hafta'], ['late', 'Kechikkan'], ['review', 'Tasdiqda']]

const initials = (name?: string | null) => (name ? name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() : '—')

export default function StudioPage() {
  const [view, setView] = useState<'list' | 'kanban'>(() => (localStorage.getItem('studio_view') as 'list' | 'kanban') || 'list')
  const [tab, setTab] = useState('all')
  const [stage, setStage] = useState('')
  const [project, setProject] = useState('')
  const [format, setFormat] = useState('')
  const [search, setSearch] = useState('')
  const [withPublished, setWithPublished] = useState(false)
  const [posts, setPosts] = useState<Row[]>([])
  const [stats, setStats] = useState<Row | null>(null)
  const [editing, setEditing] = useState<Row | null>(null)
  const [dragId, setDragId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const projects = useRefOptions('/projects/')

  const load = useCallback(async () => {
    const p: Row = { page_size: 1000, ordering: 'publish_at' }
    if (tab !== 'all') p.tab = tab
    if (stage) p.status = stage
    if (project) p.project = project
    if (format) p.content_type = format
    if (search) p.search = search
    if (withPublished) p.include_published = '1'
    const sp: Row = {}
    if (project) sp.project = project
    if (format) sp.content_type = format
    try {
      const [a, b] = await Promise.all([
        api.get<Paginated<Row>>('/posts/', { params: p }),
        api.get('/posts/stats/', { params: sp }),
      ])
      setPosts(a.data.results); setStats(b.data); setError('')
    } catch (e) { setError(errorText(e)) }
  }, [tab, stage, project, format, search, withPublished])

  useEffect(() => { const t = setTimeout(load, search ? 300 : 0); return () => clearTimeout(t) }, [load, search])

  const switchView = (v: 'list' | 'kanban') => { setView(v); try { localStorage.setItem('studio_view', v) } catch { /* */ } }

  const move = async (id: number, status: string) => {
    setPosts((ps) => ps.map((x) => (x.id === id ? { ...x, status } : x)))
    try { await api.patch(`/posts/${id}/`, { status }); load() } catch (e) { setError(errorText(e)); load() }
  }

  const now = new Date()
  const columns = withPublished ? ALL_STAGES : STAGES

  return (
    <>
      <PageHead title="Kontent studio">
        <div className="seg">
          <button className={view === 'list' ? 'on' : ''} onClick={() => switchView('list')}>Ro'yxat</button>
          <button className={view === 'kanban' ? 'on' : ''} onClick={() => switchView('kanban')}>Kanban</button>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ publish_at: null })}>+ Kontent</button>
      </PageHead>
      {stats && (
        <p className="page-sub">
          {MONTHS[now.getMonth()]} {now.getFullYear()}: {stats.month.in_work} ta kontent ishda · {stats.month.published} ta nashr qilindi
          {stats.month.late ? <> · <b className="late-text">{stats.month.late} tasi kechikmoqda</b></> : null}
        </p>
      )}

      {stats && (
        <div className="stage-tiles">
          {STAGES.map((s, i) => (
            <button key={s} className={`stage-tile ${stage === s ? 'on' : ''}`} onClick={() => setStage(stage === s ? '' : s)}>
              <span className="muted small">{i + 1}. {STAGE_LABEL[s]}</span>
              <b>{stats.stages[s] ?? 0}</b>
            </button>
          ))}
        </div>
      )}

      <div className="toolbar">
        <div className="pills">
          {TABS.map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {l}{stats && k !== 'all' && stats.tabs[k] ? <span className={`pill-n ${k === 'late' ? 'bad' : ''}`}>{stats.tabs[k]}</span> : null}
            </button>
          ))}
        </div>
        <input className="input" placeholder="Kontent qidirish…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input" value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="">Loyiha: barchasi</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input" value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="">Format: barchasi</option>
          {Object.entries(L.postType).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={withPublished} onChange={(e) => setWithPublished(e.target.checked)} /> Nashr qilinganlar ham</label>
      </div>

      {error && <div className="alert">{error}</div>}

      {view === 'list' ? (
        <div className="table-wrap">
          <table className="table studio-table">
            <thead><tr><th>Kontent</th><th>Loyiha</th><th>Format</th><th>Bosqich</th><th>Navbat</th><th>Nashr</th></tr></thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => setEditing(p)}>
                  <td>
                    <div className="task-title">{p.title}</div>
                    {p.late_days > 0 && <div className="small late-text">{p.status_display} {p.late_days} kun kechikdi</div>}
                  </td>
                  <td>{p.project_name}</td>
                  <td><span className={`fmt fmt-${p.content_type}`}>{p.content_type_display}</span></td>
                  <td><StageBar status={p.status} /></td>
                  <td>
                    {p.responsible_name
                      ? <span className="who" title={`${p.responsible_name} · ${p.responsible_job ?? ''}`}><i>{initials(p.responsible_name)}</i>{p.responsible_name}</span>
                      : <span className="muted small">biriktirilmagan</span>}
                  </td>
                  <td className={p.late_days > 0 && p.status !== 'shoot' && p.status !== 'edit' ? 'late-text' : ''}>{p.publish_at ? fmtDateTime(p.publish_at) : '—'}</td>
                </tr>
              ))}
              {posts.length === 0 && <tr><td colSpan={6} className="empty">Kontent yo'q</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="kanban studio-kanban" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(190px, 1fr))` }}>
          {columns.map((s) => {
            const col = posts.filter((p) => p.status === s)
            return (
              <div key={s} className="kanban-col" onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragId) move(dragId, s); setDragId(null) }}>
                <div className="kanban-head">{STAGE_LABEL[s]} <span className="muted">{col.length}</span></div>
                {col.map((p) => (
                  <div key={p.id} className={`kanban-card ${p.late_days > 0 ? 'is-late' : ''}`} draggable
                    onDragStart={() => setDragId(p.id)} onClick={() => setEditing(p)}>
                    <div className="kanban-title">{p.title}</div>
                    <div className="muted small">{p.project_name}</div>
                    <div className="kanban-meta">
                      <span className={`fmt fmt-${p.content_type}`}>{p.content_type_display}</span>
                      <span className="small muted">{p.publish_at ? fmtDateTime(p.publish_at).slice(0, 5) : '—'}</span>
                    </div>
                    <div className="kanban-foot">
                      <span className="who small"><i>{initials(p.responsible_name)}</i>{p.responsible_name ?? '—'}</span>
                      {p.late_days > 0 && <span className="small late-text">{p.late_days} kun</span>}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <PostForm post={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      )}
    </>
  )
}

export function StageBar({ status }: { status: string }) {
  const idx = (ALL_STAGES as readonly string[]).indexOf(status)
  return (
    <span className="stage-bar" title={STAGE_LABEL[status]}>
      <span className="dots">
        {STAGES.map((s, i) => <i key={s} className={i <= idx ? 'on' : ''} />)}
      </span>
      <span className="small">{STAGE_LABEL[status]}</span>
    </span>
  )
}

/** Kontent formasi + "Keyingi bosqich" tugmasi. */
export function PostForm({ post, onClose, onSaved }: { post: Row; onClose: () => void; onSaved: () => void }) {
  const idx = (ALL_STAGES as readonly string[]).indexOf(post.status)
  const next = post.id && idx >= 0 && idx < ALL_STAGES.length - 1 ? ALL_STAGES[idx + 1] : null
  const [error, setError] = useState('')
  const advance = async () => {
    try { await api.patch(`/posts/${post.id}/`, { status: next }); onSaved() } catch (e) { setError(errorText(e)) }
  }
  return (
    <>
      <RecordForm title={post.id ? `Kontent: ${post.title}` : 'Yangi kontent'} endpoint="/posts/" fields={postFields}
        initial={post} onClose={onClose} onSaved={onSaved} />
      {next && (
        <div className="advance-bar">
          {error && <span className="text-bad small">{error}</span>}
          <span className="small">Hozir: <b>{STAGE_LABEL[post.status]}</b>{post.responsible_name ? ` · navbat: ${post.responsible_name}` : ''}</span>
          <button className="btn btn-primary" onClick={advance}>{STAGE_LABEL[next]} bosqichiga o'tkazish →</button>
        </div>
      )}
    </>
  )
}
