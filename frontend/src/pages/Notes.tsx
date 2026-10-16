import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, errorText, type Paginated, type Row } from '../api'
import { useAuth } from '../auth'
import { PageHead, useRefOptions } from '../components/ui'
import { fmtDateTime } from '../labels'

const KINDS: Record<string, string> = { idea: "G'oya", meeting: 'Uchrashuv qaydi', brief: 'Brief', other: 'Boshqa' }

export default function NotesPage() {
  const { user } = useAuth()
  const [notes, setNotes] = useState<Row[]>([])
  const [active, setActive] = useState<Row | null>(null)
  const [kind, setKind] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const projects = useRefOptions('/projects/')

  const load = useCallback(async (selectId?: number) => {
    try {
      const params: Row = { page_size: 500 }
      if (kind) params.kind = kind
      if (search) params.search = search
      const list = (await api.get<Paginated<Row>>('/notes/', { params })).data.results
      setNotes(list)
      if (selectId) setActive(list.find((n) => n.id === selectId) ?? null)
    } catch (e) { setError(errorText(e)) }
  }, [kind, search])

  useEffect(() => { const t = setTimeout(() => load(), 250); return () => clearTimeout(t) }, [load])

  const create = async () => {
    try {
      const r = await api.post('/notes/', { title: 'Yangi yozuv', kind: 'other' })
      await load(r.data.id)
    } catch (e) { setError(errorText(e)) }
  }

  return (
    <>
      <PageHead title="Yozuvlar">
        <button className="btn btn-primary" onClick={create}>+ Yozuv</button>
      </PageHead>
      <p className="page-sub">G'oyalar, uchrashuv qaydlari, brief'lar. Ulashilgan yozuv ichida jamoa bilan chat qilish mumkin.</p>
      {error && <div className="alert">{error}</div>}
      <div className="notes">
        <div className="notes-list card">
          <input className="input" placeholder="Qidirish…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="chips">
            <button className={`chip ${kind === '' ? 'on' : ''}`} onClick={() => setKind('')}>Barchasi</button>
            {Object.entries(KINDS).map(([k, l]) => (
              <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{l}</button>
            ))}
          </div>
          {notes.length === 0 && <p className="muted">Hali yozuvlar yo'q.</p>}
          {notes.map((n) => (
            <button key={n.id} className={`note-item ${active?.id === n.id ? 'on' : ''}`} onClick={() => setActive(n)}>
              <div className="note-title">{n.pinned && '📌 '}{n.title}</div>
              <div className="muted small">
                {n.kind_display}{n.project_name ? ` · ${n.project_name}` : ''} · {n.author_name}
                {n.shared ? ' · ulashilgan' : ''}{n.messages_count ? ` · 💬 ${n.messages_count}` : ''}
              </div>
            </button>
          ))}
        </div>
        <div className="notes-editor card">
          {active ? (
            <NoteEditor key={active.id} note={active} me={user?.id} projects={projects}
              onSaved={(id) => load(id)} onDeleted={() => { setActive(null); load() }} />
          ) : (
            <div className="empty-state">
              <h3>Yozuvni tanlang yoki yangisini yarating</h3>
              <p className="muted">Mijoz bilan uchrashuv qaydlari, g'oyalar va brief'larni shu yerda saqlang.</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function NoteEditor({ note, me, projects, onSaved, onDeleted }: {
  note: Row; me?: number; projects: Row[]; onSaved: (id: number) => void; onDeleted: () => void
}) {
  const [v, setV] = useState({ title: note.title, body: note.body, kind: note.kind, project: note.project ?? '', shared: note.shared, pinned: note.pinned })
  const [messages, setMessages] = useState<Row[]>([])
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const edit = note.can_edit

  const loadMessages = useCallback(() => {
    api.get(`/notes/${note.id}/messages/`).then((r) => setMessages(r.data)).catch(() => {})
  }, [note.id])
  useEffect(() => { loadMessages() }, [loadMessages])

  const save = async () => {
    try {
      await api.patch(`/notes/${note.id}/`, { ...v, project: v.project || null })
      setMsg('Saqlandi'); onSaved(note.id)
    } catch (e) { setError(errorText(e)) }
  }
  const remove = async () => {
    if (!confirm("Yozuv o'chirilsinmi?")) return
    await api.delete(`/notes/${note.id}/`); onDeleted()
  }
  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    try { await api.post(`/notes/${note.id}/messages/`, { text }); setText(''); loadMessages() } catch (err) { setError(errorText(err)) }
  }
  const set = (k: string, val: unknown) => { setV({ ...v, [k]: val }); setMsg('') }

  return (
    <>
      <input className="input note-title-input" value={v.title} disabled={!edit} onChange={(e) => set('title', e.target.value)} />
      <div className="toolbar">
        <select className="input" value={v.kind} disabled={!edit} onChange={(e) => set('kind', e.target.value)}>
          {Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className="input" value={v.project} disabled={!edit} onChange={(e) => set('project', e.target.value ? Number(e.target.value) : '')}>
          <option value="">Loyihasiz</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={v.shared} disabled={!edit} onChange={(e) => set('shared', e.target.checked)} /> Jamoa bilan ulashish</label>
        <label className="check"><input type="checkbox" checked={v.pinned} disabled={!edit} onChange={(e) => set('pinned', e.target.checked)} /> Yuqorida</label>
      </div>
      <textarea className="input note-body" rows={12} value={v.body} disabled={!edit} placeholder="Matn…" onChange={(e) => set('body', e.target.value)} />
      <div className="muted small">{note.author_name} · oxirgi o'zgarish {fmtDateTime(note.updated_at)}</div>
      {error && <div className="alert">{error}</div>}
      {edit && (
        <div className="form-actions">
          <button className="btn-link danger" onClick={remove}>O'chirish</button>
          {msg && <span className="saved">✓ {msg}</span>}
          <button className="btn btn-primary" onClick={save}>Saqlash</button>
        </div>
      )}

      {(note.shared || messages.length > 0) && (
        <>
          <h4>Chat</h4>
          <ul className="comments">
            {messages.map((m) => (
              <li key={m.id} className={m.author === me ? 'mine' : ''}>
                <b>{m.author_name}</b> <span className="muted small">{fmtDateTime(m.created_at)}</span>
                <div className="pre">{m.text}</div>
              </li>
            ))}
            {messages.length === 0 && <li className="muted">Hali xabar yo'q</li>}
          </ul>
          <form className="inline-form" onSubmit={send}>
            <input className="input grow" placeholder="Xabar yozing…" value={text} onChange={(e) => setText(e.target.value)} />
            <button className="btn">Yuborish</button>
          </form>
        </>
      )}
    </>
  )
}
