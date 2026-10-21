import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, errorText, type Paginated, type Row } from '../api'
import { useAuth } from '../auth'
import { Badge, Modal, PageHead, refLabel, useRefOptions } from '../components/ui'
import { L, fmtDateTime, num, relDay, todayISO } from '../labels'

const STATUSES = Object.keys(L.taskStatus) as (keyof typeof L.taskStatus)[]
const TABS: [string, string][] = [
  ['mine', 'Mening'], ['due', 'Bugungacha'], ['late', 'Kechikkan'], ['approve', 'Tasdiqlashim kerak'],
  ['given', 'Men bergan'], ['all', 'Barchasi'], ['done', 'Bajarilganlar'],
]

const initials = (name?: string | null) => (name ? name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() : '—')

const isoIn = (days: number) => {
  const d = new Date(); d.setDate(d.getDate() + days)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
/** Shu hafta jumasi (bugun juma yoki undan keyin bo'lsa — keyingi juma). */
const nextFriday = () => { const wd = new Date().getDay(); return isoIn(((5 - wd + 7) % 7) || 7) }

/* ---------------- Vazifa formasi ---------------- */

export function TaskForm({ initial, onClose, onSaved }: { initial: Row; onClose: () => void; onSaved: (t: Row) => void }) {
  const isNew = !initial.id
  const users = useRefOptions('/users/')
  const projects = useRefOptions('/projects/')
  const [v, setV] = useState({
    title: initial.title ?? '', project: initial.project ?? '', assignee: initial.assignee ?? '',
    due_date: initial.due_date ?? '', due_time: (initial.due_time ?? '').slice(0, 5), priority: initial.priority ?? 'medium', status: initial.status ?? 'todo',
    description: initial.description ?? '',
    steps: ((initial.checklist ?? []) as Row[]).map((s) => s.text).join('\n'),
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k: string, val: unknown) => setV((s) => ({ ...s, [k]: val }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    // Qadamlarni qayta yozganda bajarilganlari saqlanib qoladi
    const old = new Map(((initial.checklist ?? []) as Row[]).map((s) => [s.text, s.done]))
    const checklist = v.steps.split('\n').map((t) => t.trim()).filter(Boolean).map((text) => ({ text, done: !!old.get(text) }))
    const payload = {
      title: v.title, project: v.project || null, assignee: v.assignee || null, due_date: v.due_date || null,
      due_time: v.due_date && v.due_time ? v.due_time : null,
      priority: v.priority, status: v.status, description: v.description, checklist,
    }
    try {
      const r = isNew ? await api.post('/tasks/', payload) : await api.patch(`/tasks/${initial.id}/`, payload)
      onSaved(r.data)
    } catch (err) { setError(errorText(err)) } finally { setSaving(false) }
  }

  const chips: [string, string][] = [['Bugun', isoIn(0)], ['Ertaga', isoIn(1)], ['Juma', nextFriday()], ['1 haftada', isoIn(7)]]

  return (
    <Modal title={isNew ? 'Yangi vazifa' : 'Vazifani tahrirlash'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <div className="form-grid">
          <label className="field full"><span>Sarlavha *</span>
            <input className="input" value={v.title} required autoFocus placeholder="Masalan: Reels montaji" onChange={(e) => set('title', e.target.value)} />
          </label>
          <label className="field"><span>Loyiha</span>
            <select className="input" value={v.project} onChange={(e) => set('project', e.target.value ? Number(e.target.value) : '')}>
              <option value="">— Umumiy (loyihasiz) —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Kimga (ijrochi)</span>
            <select className="input" value={v.assignee} onChange={(e) => set('assignee', e.target.value ? Number(e.target.value) : '')}>
              <option value="">— Tanlanmagan —</option>
              {users.filter((u) => u.is_active !== false).map((u) => (
                <option key={u.id} value={u.id}>{refLabel(u)}{u.position ? ` (${u.position})` : ''}</option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>Muddat (sana va vaqt)</span>
            <div className="due-row">
              <input className="input" type="date" value={v.due_date} onChange={(e) => set('due_date', e.target.value)} />
              <input className="input" type="time" value={v.due_time} disabled={!v.due_date} title="Bo'sh qolsa — ish kuni oxiri"
                onChange={(e) => set('due_time', e.target.value)} />
            </div>
            <small className="muted">Muddatga 2 soat qolganda ijrochiga Telegram'da eslatma boradi. Vaqt kiritilmasa — ish kuni oxiri.</small>
            <div className="chips due-chips">
              {chips.map(([l, d]) => (
                <button type="button" key={l} className={`chip ${v.due_date === d ? 'on' : ''}`} onClick={() => set('due_date', d)}>{l}</button>
              ))}
            </div>
          </div>
          <label className="field"><span>Muhimlik *</span>
            <select className="input" value={v.priority} onChange={(e) => set('priority', e.target.value)}>
              {Object.entries(L.priority).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="field"><span>Holat *</span>
            <select className="input" value={v.status} onChange={(e) => set('status', e.target.value)}>
              {Object.entries(L.taskStatus).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="field full"><span>Tavsif</span>
            <textarea className="input" rows={3} value={v.description} placeholder="Vazifa haqida qisqacha yozing" onChange={(e) => set('description', e.target.value)} />
          </label>
          <label className="field full"><span>Qadamlar (ixtiyoriy)</span>
            <textarea className="input" rows={4} value={v.steps} placeholder={'Har qatorga bittadan:\nSsenariy yozish\nSyomka\nMontaj'} onChange={(e) => set('steps', e.target.value)} />
            <small className="muted">Vazifa bir necha bosqichdan iborat bo'lsa — har birini yangi qatorga yozing.</small>
          </label>
        </div>
        {error && <div className="alert pre">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Bekor qilish</button>
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Saqlanmoqda…' : isNew ? 'Vazifa yaratish' : 'Saqlash'}</button>
        </div>
      </form>
    </Modal>
  )
}

/* ---------------- Doska / ro'yxat ---------------- */

/** Vazifalar. projectId berilsa — faqat shu loyiha vazifalari (barcha holatlar). */
export function TaskBoard({ projectId }: { projectId?: number }) {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState(projectId ? 'all' : params.get('overdue') ? 'late' : params.get('tab') ?? 'mine')
  const [view, setView] = useState<'kanban' | 'list'>(() => (localStorage.getItem('tasks_view') as 'kanban' | 'list') || 'kanban')
  const [tasks, setTasks] = useState<Row[]>([])
  const [counts, setCounts] = useState<Row>({})
  const [project, setProject] = useState('')
  const [assignee, setAssignee] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Row | null>(!projectId && params.get('new') ? { assignee: user?.id } : null)
  const [viewing, setViewing] = useState<number | null>(Number(params.get('open')) || null)
  const [dragId, setDragId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const users = useRefOptions('/users/')
  const projects = useRefOptions(projectId ? undefined : '/projects/')

  const load = useCallback(async () => {
    const q: Row = { page_size: 1000, ordering: tab === 'done' ? '-done_at' : 'due_date' }
    if (tab !== 'all') q.tab = tab
    if (projectId) q.project = projectId
    else if (project === 'none') q.project__isnull = 'true'
    else if (project) q.project = project
    if (assignee) q.assignee = assignee
    if (search) q.search = search
    try {
      const [a, b] = await Promise.all([
        api.get<Paginated<Row>>('/tasks/', { params: q }),
        api.get('/tasks/stats/', { params: projectId ? { project: projectId } : {} }),
      ])
      setTasks(a.data.results); setCounts(b.data); setError('')
    } catch (e) { setError(errorText(e)) }
  }, [tab, projectId, project, assignee, search])

  useEffect(() => { const t = setTimeout(load, search ? 300 : 0); return () => clearTimeout(t) }, [load, search])

  const switchView = (v: 'kanban' | 'list') => { setView(v); try { localStorage.setItem('tasks_view', v) } catch { /* */ } }

  const move = async (t: Row, status: string) => {
    if (t.status === status) return
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, status } : x)))
    try {
      const r = await api.patch(`/tasks/${t.id}/`, { status })
      if (status === 'done' && r.data.status === 'review') setNotice(`"${t.title}" tasdiqqa yuborildi — vazifa bergan xodim tasdiqlaydi.`)
      load()
    } catch (e) { setError(errorText(e)); load() }
  }

  const today = todayISO()
  const columns = tab === 'done' ? (['done'] as const) : STATUSES

  return (
    <>
      <div className="toolbar">
        {!projectId && (
          <div className="pills">
            {TABS.map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {l}{counts[k] ? <span className={`pill-n ${k === 'late' || k === 'approve' ? 'bad' : ''}`}>{counts[k]}</span> : null}
              </button>
            ))}
          </div>
        )}
        <div className="seg seg-light">
          <button className={view === 'kanban' ? 'on' : ''} onClick={() => switchView('kanban')}>Kanban</button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => switchView('list')}>Ro'yxat</button>
        </div>
      </div>
      <div className="toolbar">
        <input className="input" placeholder="Qidirish…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {!projectId && (
          <select className="input" value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">Loyiha: barchasi</option>
            <option value="none">Umumiy (loyihasiz)</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Ijrochi: barchasi</option>
          {users.map((u) => <option key={u.id} value={u.id}>{refLabel(u)}</option>)}
        </select>
        <button className="btn btn-primary" onClick={() => setEditing({ project: projectId, assignee: '' })}>+ Vazifa berish</button>
      </div>
      {error && <div className="alert">{error}</div>}
      {notice && <div className="alert-bar alert-info notice" onClick={() => setNotice('')}>👀 {notice}</div>}

      {view === 'kanban' ? (
        <div className="kanban" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(230px, 1fr))` }}>
          {columns.map((s) => {
            const col = tasks.filter((t) => t.status === s)
            return (
              <div key={s} className={`kanban-col task-col-${s}`} onDragOver={(e) => e.preventDefault()}
                onDrop={() => { const t = tasks.find((x) => x.id === dragId); if (t) move(t, s); setDragId(null) }}>
                <div className="kanban-head">{L.taskStatus[s]} <span className="muted">{col.length}</span></div>
                {col.map((t) => <TaskCard key={t.id} t={t} today={today} showProject={!projectId}
                  onDrag={() => setDragId(t.id)} onOpen={() => setViewing(t.id)} />)}
                {col.length === 0 && <div className="kanban-empty muted small">Bo'sh</div>}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Vazifa</th>{!projectId && <th>Loyiha</th>}<th>Kim → kimga</th><th>Muddat</th><th>Qadamlar</th><th>Holat</th></tr></thead>
            <tbody>
              {tasks.map((t) => {
                const rd = relDay(t.due_date)
                return (
                  <tr key={t.id} className="clickable" onClick={() => setViewing(t.id)}>
                    <td><div className="task-title">{t.title}</div><Badge value={t.priority} label={t.priority_display} /></td>
                    {!projectId && <td>{t.project_name ?? <span className="muted">Umumiy</span>}</td>}
                    <td className="small">{t.created_by_name ?? '—'} → <b>{t.assignee_name ?? '—'}</b></td>
                    <td className={t.status !== 'done' ? rd.tone : 'muted'}>{t.status === 'done' ? fmtDateTime(t.done_at) : `${rd.text}${t.due_time ? ' ' + t.due_time.slice(0, 5) : ''}`}</td>
                    <td>{t.steps_total ? `${t.steps_done}/${t.steps_total}` : '—'}</td>
                    <td><Badge value={t.status} label={t.status_display} /></td>
                  </tr>
                )
              })}
              {tasks.length === 0 && <tr><td colSpan={6} className="empty">Vazifa yo'q</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <TaskForm initial={editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); if (params.has('new')) { params.delete('new'); setParams(params) } }} />
      )}
      {viewing && (
        <TaskDetail id={viewing} me={user?.id}
          onClose={() => { setViewing(null); if (params.has('open')) { params.delete('open'); setParams(params) } }}
          onEdit={(t) => { setViewing(null); setEditing(t) }} onChanged={load} />
      )}
    </>
  )
}

function TaskCard({ t, today, showProject, onDrag, onOpen }: { t: Row; today: string; showProject: boolean; onDrag: () => void; onOpen: () => void }) {
  const overdue = t.due_date && t.due_date < today && t.status !== 'done'
  const rd = relDay(t.due_date)
  const draggable = t.can_supervise || t.is_assignee
  return (
    <div className={`kanban-card ${overdue ? 'is-late' : ''}`} draggable={draggable} onDragStart={onDrag} onClick={onOpen}>
      <div className="kanban-title">{t.title}</div>
      {showProject && <div className="muted small">{t.project_name ?? 'Umumiy'}</div>}
      <div className="kanban-meta">
        <Badge value={t.priority} label={t.priority_display} />
        <span className={`small ${t.status === 'done' ? 'muted' : rd.tone}`}>{t.status === 'done' ? '✓' : rd.text}{t.status !== 'done' && t.due_time ? ` ${t.due_time.slice(0, 5)}` : ''}</span>
      </div>
      {t.steps_total > 0 && (
        <div className="steps-bar" title={`${t.steps_done}/${t.steps_total} qadam`}>
          <span style={{ width: `${(t.steps_done / t.steps_total) * 100}%` }} /><small>{t.steps_done}/{t.steps_total}</small>
        </div>
      )}
      <div className="kanban-foot">
        <span className="who small" title={`${t.created_by_name ?? '—'} → ${t.assignee_name ?? '—'}`}>
          <i className="giver">{initials(t.created_by_name)}</i>→<i>{initials(t.assignee_name)}</i>
          <span className="who-name">{t.assignee_name ?? 'Biriktirilmagan'}</span>
        </span>
        {t.returned_count > 0 && t.status !== 'done' && <span className="small text-bad" title="Qaytarilgan">↩ {t.returned_count}</span>}
      </div>
    </div>
  )
}

/* ---------------- Vazifa kartochkasi ---------------- */

function TaskDetail({ id, me, onClose, onEdit, onChanged }: {
  id: number; me?: number; onClose: () => void; onEdit: (t: Row) => void; onChanged: () => void
}) {
  const [task, setTask] = useState<Row | null>(null)
  const [comments, setComments] = useState<Row[]>([])
  const [entries, setEntries] = useState<Row[]>([])
  const [text, setText] = useState('')
  const [hours, setHours] = useState('')
  const [returning, setReturning] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [t, c, e] = await Promise.all([
        api.get(`/tasks/${id}/`),
        api.get<Paginated<Row>>('/task-comments/', { params: { task: id, page_size: 1000 } }),
        api.get<Paginated<Row>>('/time-entries/', { params: { task: id, page_size: 1000 } }),
      ])
      setTask(t.data); setComments(c.data.results); setEntries(e.data.results)
    } catch (err) { setError(errorText(err)) }
  }, [id])
  useEffect(() => { load() }, [load])

  const patch = async (data: Row) => {
    try { const r = await api.patch(`/tasks/${id}/`, data); setTask(r.data); setError(''); onChanged(); load() }
    catch (err) { setError(errorText(err)) }
  }
  const toggleStep = (i: number) => {
    const checklist = (task!.checklist as Row[]).map((s, j) => (j === i ? { ...s, done: !s.done } : s))
    setTask({ ...task!, checklist })
    patch({ checklist })
  }
  const addComment = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    try { await api.post('/task-comments/', { task: id, text }); setText(''); load() } catch (err) { setError(errorText(err)) }
  }
  const addTime = async (e: FormEvent) => {
    e.preventDefault()
    try { await api.post('/time-entries/', { task: id, hours, date: todayISO() }); setHours(''); load(); onChanged() } catch (err) { setError(errorText(err)) }
  }
  const remove = async () => {
    if (!confirm("Vazifa o'chirilsinmi?")) return
    try { await api.delete(`/tasks/${id}/`); onChanged(); onClose() } catch (err) { setError(errorText(err)) }
  }

  if (!task) return <Modal title="Vazifa" onClose={onClose}><div className="muted">{error || 'Yuklanmoqda…'}</div></Modal>

  const sup = task.can_supervise
  const mine = task.is_assignee
  const selfTask = mine && sup
  const st = task.status
  const canTouch = sup || mine

  return (
    <Modal title={task.title} onClose={onClose} wide>
      <div className="task-flow">
        <span className="who"><i className="giver">{initials(task.created_by_name)}</i>{task.created_by_name ?? '—'}</span>
        <span className="muted">→ vazifa berdi →</span>
        <span className="who"><i>{initials(task.assignee_name)}</i><b>{task.assignee_name ?? 'Biriktirilmagan'}</b></span>
        <Badge value={st} label={task.status_display} />
      </div>

      {/* Holatga va rolga qarab amallar */}
      {canTouch && (
        <div className="task-actions">
          {st === 'todo' && (mine || sup) && <button className="btn btn-primary" onClick={() => patch({ status: 'in_progress' })}>▶ Boshlash</button>}
          {(st === 'todo' || st === 'in_progress') && mine && !selfTask && (
            <button className="btn btn-primary" onClick={() => patch({ status: 'review' })}>👀 Tasdiqqa yuborish</button>
          )}
          {(st === 'todo' || st === 'in_progress') && (selfTask || (sup && !mine)) && (
            <button className="btn btn-primary" onClick={() => patch({ status: 'done' })}>✓ Tayyor</button>
          )}
          {st === 'review' && sup && !returning && (
            <>
              <button className="btn btn-primary" onClick={() => patch({ status: 'done' })}>✓ Tasdiqlash</button>
              <button className="btn btn-warn" onClick={() => setReturning(true)}>↩ Qaytarish</button>
            </>
          )}
          {st === 'review' && !sup && <span className="muted small">Tasdiq kutilmoqda: {task.created_by_name ?? 'vazifa beruvchi'}</span>}
          {st === 'done' && sup && <button className="btn" onClick={() => patch({ status: 'in_progress' })}>Qayta ochish</button>}
          {returning && (
            <form className="inline-form grow" onSubmit={(e) => { e.preventDefault(); patch({ status: 'in_progress', return_reason: reason }); setReturning(false); setReason('') }}>
              <input className="input grow" autoFocus placeholder="Nima tuzatilishi kerak?" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button className="btn btn-warn">Qaytarish</button>
              <button type="button" className="btn" onClick={() => setReturning(false)}>Bekor</button>
            </form>
          )}
        </div>
      )}

      <div className="detail-grid">
        <div><span className="muted">Loyiha</span>{task.project_name ?? 'Umumiy'}</div>
        <div><span className="muted">Muddat</span><span className={st !== 'done' ? relDay(task.due_date).tone : ''}>{relDay(task.due_date).text}{task.due_date ? ` (${task.due_date.split('-').reverse().join('.')}${task.due_time ? ' ' + task.due_time.slice(0, 5) : ''})` : ''}</span></div>
        <div><span className="muted">Muhimlik</span><Badge value={task.priority} label={task.priority_display} /></div>
        <div><span className="muted">Sarflangan vaqt</span>{num(task.spent_hours)} soat</div>
        {task.returned_count > 0 && <div><span className="muted">Qaytarilgan</span><span className="text-bad">{task.returned_count} marta</span></div>}
        {task.done_at && <div><span className="muted">Bajarildi</span>{fmtDateTime(task.done_at)}</div>}
      </div>
      {task.description && <p className="pre">{task.description}</p>}

      {task.checklist?.length > 0 && (
        <>
          <h4>Qadamlar · {task.steps_done}/{task.steps_total}</h4>
          <ul className="checklist">
            {(task.checklist as Row[]).map((s, i) => (
              <li key={i} className={s.done ? 'done' : ''}>
                <label className="check"><input type="checkbox" checked={!!s.done} disabled={!canTouch} onChange={() => toggleStep(i)} /> {s.text}</label>
              </li>
            ))}
          </ul>
        </>
      )}

      <h4>Izohlar</h4>
      <ul className="comments">
        {comments.map((c) => (
          <li key={c.id} className={c.author === me ? 'mine' : ''}><b>{c.author_name}</b> <span className="muted small">{fmtDateTime(c.created_at)}</span><div className="pre">{c.text}</div></li>
        ))}
        {comments.length === 0 && <li className="muted">Izohlar yo'q</li>}
      </ul>
      <form className="inline-form" onSubmit={addComment}>
        <input className="input grow" placeholder="Izoh yozing…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn">Yuborish</button>
      </form>

      {mine && (
        <>
          <h4>Ish vaqti</h4>
          <form className="inline-form" onSubmit={addTime}>
            <input className="input" type="number" step="0.25" min="0.25" placeholder="Soat" value={hours} onChange={(e) => setHours(e.target.value)} required />
            <button className="btn">Bugungi vaqtni yozish</button>
          </form>
        </>
      )}
      {entries.length > 0 && (
        <ul className="list compact">
          {entries.map((e) => <li key={e.id}><span>{e.user_name} · {e.date.split('-').reverse().join('.')}</span><span>{num(e.hours)} soat</span></li>)}
        </ul>
      )}

      {error && <div className="alert">{error}</div>}
      {sup && (
        <div className="form-actions">
          <button className="btn-link danger" onClick={remove}>O'chirish</button>
          <button className="btn" onClick={() => onEdit(task)}>Tahrirlash</button>
        </div>
      )}
    </Modal>
  )
}

export default function TasksPage() {
  return (
    <>
      <PageHead title="Vazifalar" />
      <TaskBoard />
    </>
  )
}
