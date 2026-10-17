import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, errorText, type Row } from '../api'
import { useAuth } from '../auth'
import { RecordForm } from '../components/CrudPage'
import { Badge, PageHead } from '../components/ui'
import { L, longDateUz, money, relDay } from '../labels'
import { taskFields } from './Tasks'

const MONTHS_SHORT = ['YAN', 'FEV', 'MAR', 'APR', 'MAY', 'IYN', 'IYL', 'AVG', 'SEN', 'OKT', 'NOY', 'DEK']
const ALERT_ICON: Record<string, string> = { clock: '⏰', calendar: '📅', alarm: '⚠️' }

export default function Dashboard() {
  const { user } = useAuth()
  const [d, setD] = useState<Row | null>(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(() => {
    api.get('/reports/dashboard/').then((r) => setD(r.data)).catch((e) => setError(errorText(e)))
  }, [])
  useEffect(() => { load() }, [load])

  const complete = async (id: number) => {
    setD((prev) => prev && { ...prev, my_tasks: prev.my_tasks.filter((t: Row) => t.id !== id) })
    try { await api.patch(`/tasks/${id}/`, { status: 'done' }); load() } catch (e) { setError(errorText(e)); load() }
  }

  if (error && !d) return <div className="alert">{error}</div>
  if (!d) return <div className="muted on-bg">Yuklanmoqda…</div>
  const t = d.today_tasks
  const att = d.attendance

  return (
    <>
      <PageHead title={`Salom, ${user?.full_name}`}>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Vazifa</button>
      </PageHead>
      <p className="page-sub">{longDateUz()}</p>

      {d.alerts.length > 0 && (
        <div className="alerts">
          {d.alerts.map((a: Row, i: number) => (
            <Link key={i} to={a.link} className={`alert-bar alert-${a.tone}`}>
              <span className="alert-icon" aria-hidden>{ALERT_ICON[a.icon] ?? '•'}</span>
              <span className="alert-text">{a.text}</span>
              <span className="alert-action">{a.action} →</span>
            </Link>
          ))}
        </div>
      )}

      <div className="stats dash-stats">
        <Link to="/projects" className="stat stat-link">
          <div className="stat-label">Faol loyihalar</div>
          <div className="stat-value big">{d.projects.active}</div>
          <div className="stat-hint">{d.projects.deadline_soon ? `${d.projects.deadline_soon} tasida muddat yaqinlashmoqda` : 'Muddati yaqin loyiha yo\'q'}</div>
        </Link>
        <Link to="/tasks" className="stat stat-link">
          <div className="stat-label">Bugungi vazifalarim</div>
          <div className="stat-value big">{t.total}</div>
          <div className="stat-hint">
            {t.done} tasi bajarildi{t.overdue ? <> · <span className="text-bad">{t.overdue} ta kechikkan</span></> : null}
          </div>
        </Link>
        {d.leads.visible && (
          <Link to="/leads" className="stat stat-link">
            <div className="stat-label">Yangi so'rovlar</div>
            <div className="stat-value big">{d.leads.new}</div>
            <div className="stat-hint">{d.leads.follow_up ? `${d.leads.follow_up} tasiga qayta aloqa kerak` : 'Qayta aloqa kerak emas'}</div>
          </Link>
        )}
        {att && (
          <Link to="/attendance" className="stat stat-link">
            <div className="stat-label">Bugungi davomatim</div>
            <AttendanceValue att={att} />
          </Link>
        )}
      </div>

      <div className="dash-grid">
        <section className="card">
          <div className="card-head">
            <h3>Yaqin vazifalarim</h3>
            <Link to="/tasks">Barchasi</Link>
          </div>
          {d.my_tasks.length === 0 ? <p className="muted">Ochiq vazifangiz yo'q 🎉</p> : (
            <ul className="task-list">
              {d.my_tasks.map((x: Row) => {
                const rd = relDay(x.due_date)
                return (
                  <li key={x.id}>
                    <button className="check-btn" title="Bajarildi deb belgilash" onClick={() => complete(x.id)} aria-label="Bajarildi" />
                    <Link to={`/tasks?open=${x.id}`} className="task-main">
                      <div className="task-title">{x.title}</div>
                      <div className="muted small">{x.project__name}</div>
                    </Link>
                    <span className={`small task-due ${rd.tone}`}>{rd.text}</span>
                    <Badge value={x.status} label={L.taskStatus[x.status as keyof typeof L.taskStatus]} />
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Yaqin nashrlar</h3>
            <Link to="/content">Kalendar</Link>
          </div>
          {d.upcoming_posts.length === 0 ? <p className="muted">Yaqin 7 kunda nashr yo'q</p> : (
            <ul className="post-list">
              {d.upcoming_posts.map((p: Row) => {
                const dt = new Date(p.publish_at)
                return (
                  <li key={p.id}>
                    <div className="date-tile"><b>{dt.getDate()}</b><span>{MONTHS_SHORT[dt.getMonth()]}</span></div>
                    <div className="post-main">
                      <div className="task-title">{p.title}</div>
                      <div className="muted small">{p.project__name} · {L.postPlatform[p.platform as keyof typeof L.postPlatform]} · {dt.toTimeString().slice(0, 5)}</div>
                    </div>
                    <div className="post-badges">
                      <span className="type-chip">{L.postType[p.content_type as keyof typeof L.postType]}</span>
                      <Badge value={p.status} label={L.postStatus[p.status as keyof typeof L.postStatus]} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      {d.project_progress.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h3>Loyihalarim bajarilishi</h3>
            <Link to="/projects">Barchasi</Link>
          </div>
          <div className="progress-list">
            {d.project_progress.map((p: Row) => {
              const pct = p.total ? Math.round((p.done / p.total) * 100) : 0
              return (
                <Link key={p.id} to={`/projects/${p.id}`} className="progress-row">
                  <span className="progress-name">{p.name}</span>
                  <span className="progress-track"><span style={{ width: `${pct}%` }} /></span>
                  <span className="progress-pct">{pct}%</span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {creating && (
        <RecordForm title="Yangi vazifa" endpoint="/tasks/" fields={taskFields} initial={{ assignee: user?.id }}
          onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load() }} />
      )}
    </>
  )
}

function AttendanceValue({ att }: { att: Row }) {
  if (!att.workday && !att.status) return <><div className="stat-value">Dam olish kuni</div><div className="stat-hint">Bugun ish kuni emas</div></>
  if (!att.status) return <><div className="stat-value text-warn">Belgilanmagan</div><div className="stat-hint">Ish {String(att.work_start).slice(0, 5)} da boshlanadi</div></>
  const fine = Number(att.fine)
  return (
    <>
      <div className={`stat-value ${att.status === 'absent' || att.late ? 'text-bad' : att.status === 'present' ? 'text-good' : ''}`}>
        {att.status === 'present' ? (att.late ? 'Kech keldingiz' : "O'z vaqtida") : att.status_display}
      </div>
      <div className="stat-hint">
        {att.check_in ? `Keldi ${String(att.check_in).slice(0, 5)}` : ''}{att.check_out ? ` · ketdi ${String(att.check_out).slice(0, 5)}` : ''}
        {fine ? <span className="text-bad">{att.check_in ? ' · ' : ''}jarima {money(fine)}</span> : null}
      </div>
    </>
  )
}
