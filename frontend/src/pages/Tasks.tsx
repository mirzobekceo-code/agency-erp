import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, errorText, type Paginated, type Row } from '../api'
import { useAuth } from '../auth'
import { RecordForm, type Field } from '../components/CrudPage'
import { Badge, Modal, PageHead, refLabel, useRefOptions } from '../components/ui'
import { L, fmtDate, fmtDateTime, num, todayISO } from '../labels'

const STATUSES = Object.keys(L.taskStatus) as (keyof typeof L.taskStatus)[]

export const taskFields: Field[] = [
  { name: 'title', label: 'Vazifa', required: true, full: true },
  { name: 'project', label: 'Loyiha', type: 'ref', ref: '/projects/', required: true },
  { name: 'assignee', label: 'Ijrochi', type: 'ref', ref: '/users/' },
  { name: 'status', label: 'Holat', type: 'select', options: L.taskStatus, required: true, default: 'todo' },
  { name: 'priority', label: 'Muhimlik', type: 'select', options: L.priority, required: true, default: 'medium' },
  { name: 'due_date', label: 'Muddat', type: 'date' },
  { name: 'estimated_hours', label: 'Rejalashtirilgan soat', type: 'number', default: 0 },
  { name: 'description', label: 'Tavsif', type: 'textarea' },
]

/** Vazifalar Kanban doskasi. projectId berilsa faqat shu loyiha vazifalari. */
export function TaskBoard({ projectId }: { projectId?: number }) {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const [tasks, setTasks] = useState<Row[]>([])
  const [assignee, setAssignee] = useState(projectId ? '' : params.get('assignee') ?? '')
  const [project, setProject] = useState('')
  const [editing, setEditing] = useState<Row | null>(null)
  const [viewing, setViewing] = useState<number | null>(Number(params.get('open')) || null)
  const [dragId, setDragId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const users = useRefOptions('/users/')
  const projects = useRefOptions(projectId ? undefined : '/projects/')

  const load = useCallback(async () => {
    const q: Record<string, string | number> = { page_size: 1000, ordering: 'due_date' }
    if (projectId) q.project = projectId
    else if (project) q.project = project
    if (assignee) q.assignee = assignee
    try {
      setTasks((await api.get<Paginated<Row>>('/tasks/', { params: q })).data.results)
    } catch (e) { setError(errorText(e)) }
  }, [projectId, project, assignee])

  useEffect(() => { load() }, [load])

  const move = async (id: number, status: string) => {
    const prev = tasks
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status } : t)))
    try {
      await api.patch(`/tasks/${id}/`, { status })
    } catch (e) {
      setTasks(prev)
      alert(errorText(e))
    }
  }

  const today = todayISO()

  return (
    <>
      <div className="toolbar">
        {!projectId && (
          <select className="input" value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">Loyiha: barchasi</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Ijrochi: barchasi</option>
          {user && <option value={user.id}>Faqat menikilar</option>}
          {users.filter((u) => u.id !== user?.id).map((u) => <option key={u.id} value={u.id}>{refLabel(u)}</option>)}
        </select>
        <button className="btn btn-primary" onClick={() => setEditing({ project: projectId, assignee: user?.id })}>+ Vazifa</button>
      </div>
      {error && <div className="alert">{error}</div>}

      <div className="kanban">
        {STATUSES.map((s) => {
          const col = tasks.filter((t) => t.status === s)
          return (
            <div key={s} className="kanban-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragId) move(dragId, s); setDragId(null) }}>
              <div className="kanban-head">{L.taskStatus[s]} <span className="muted">{col.length}</span></div>
              {col.map((t) => {
                const overdue = t.due_date && t.due_date < today && t.status !== 'done'
                return (
                  <div key={t.id} className="kanban-card" draggable
                    onDragStart={() => setDragId(t.id)} onClick={() => setViewing(t.id)}>
                    <div className="kanban-title">{t.title}</div>
                    {!projectId && <div className="muted small">{t.project_name}</div>}
                    <div className="kanban-meta">
                      <Badge value={t.priority} label={t.priority_display} />
                      <span className={`small ${overdue ? 'text-bad' : 'muted'}`}>{fmtDate(t.due_date)}</span>
                    </div>
                    <div className="kanban-foot">
                      <span className="small muted">{t.assignee_name ?? 'Biriktirilmagan'}</span>
                      {/* Sichqonchasiz qurilmalar uchun holatni almashtirish */}
                      <select className="mini-select" value={t.status} onClick={(e) => e.stopPropagation()}
                        onChange={(e) => move(t.id, e.target.value)} aria-label="Holat">
                        {STATUSES.map((x) => <option key={x} value={x}>{L.taskStatus[x]}</option>)}
                      </select>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {editing && (
        <RecordForm title={editing.id ? 'Vazifani tahrirlash' : 'Yangi vazifa'} endpoint="/tasks/" fields={taskFields}
          initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      )}
      {viewing && (
        <TaskDetail id={viewing} onClose={() => { setViewing(null); if (params.has('open')) { params.delete('open'); setParams(params) } }}
          onEdit={(t) => { setViewing(null); setEditing(t) }} onChanged={load} />
      )}
    </>
  )
}

function TaskDetail({ id, onClose, onEdit, onChanged }: {
  id: number; onClose: () => void; onEdit: (t: Row) => void; onChanged: () => void
}) {
  const [task, setTask] = useState<Row | null>(null)
  const [comments, setComments] = useState<Row[]>([])
  const [entries, setEntries] = useState<Row[]>([])
  const [text, setText] = useState('')
  const [hours, setHours] = useState('')
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

  const addComment = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    try { await api.post('/task-comments/', { task: id, text }); setText(''); load() } catch (err) { setError(errorText(err)) }
  }

  const addTime = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api.post('/time-entries/', { task: id, hours, date: todayISO() })
      setHours(''); load(); onChanged()
    } catch (err) { setError(errorText(err)) }
  }

  const remove = async () => {
    if (!confirm("Vazifa o'chirilsinmi?")) return
    try { await api.delete(`/tasks/${id}/`); onChanged(); onClose() } catch (err) { setError(errorText(err)) }
  }

  if (!task) return <Modal title="Vazifa" onClose={onClose}><div className="muted">{error || 'Yuklanmoqda…'}</div></Modal>

  return (
    <Modal title={task.title} onClose={onClose} wide>
      <div className="detail-grid">
        <div><span className="muted">Loyiha</span>{task.project_name}</div>
        <div><span className="muted">Ijrochi</span>{task.assignee_name ?? '—'}</div>
        <div><span className="muted">Holat</span><Badge value={task.status} label={task.status_display} /></div>
        <div><span className="muted">Muhimlik</span><Badge value={task.priority} label={task.priority_display} /></div>
        <div><span className="muted">Muddat</span>{fmtDate(task.due_date)}</div>
        <div><span className="muted">Soat (sarflangan / reja)</span>{num(task.spent_hours)} / {num(task.estimated_hours)}</div>
      </div>
      {task.description && <p className="pre">{task.description}</p>}

      <h4>Ish vaqti</h4>
      <form className="inline-form" onSubmit={addTime}>
        <input className="input" type="number" step="0.25" min="0.25" placeholder="Soat" value={hours} onChange={(e) => setHours(e.target.value)} required />
        <button className="btn">Bugungi vaqtni yozish</button>
      </form>
      {entries.length > 0 && (
        <ul className="list compact">
          {entries.map((e) => <li key={e.id}><span>{e.user_name} · {fmtDate(e.date)}</span><span>{num(e.hours)} soat</span></li>)}
        </ul>
      )}

      <h4>Izohlar</h4>
      <ul className="comments">
        {comments.map((c) => (
          <li key={c.id}><b>{c.author_name}</b> <span className="muted small">{fmtDateTime(c.created_at)}</span><div className="pre">{c.text}</div></li>
        ))}
        {comments.length === 0 && <li className="muted">Izohlar yo'q</li>}
      </ul>
      <form className="inline-form" onSubmit={addComment}>
        <input className="input grow" placeholder="Izoh yozing…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn">Yuborish</button>
      </form>

      {error && <div className="alert">{error}</div>}
      <div className="form-actions">
        <button className="btn-link danger" onClick={remove}>O'chirish</button>
        <button className="btn btn-primary" onClick={() => onEdit(task)}>Tahrirlash</button>
      </div>
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
