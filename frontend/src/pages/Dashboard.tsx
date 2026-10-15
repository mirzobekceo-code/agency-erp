import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, errorText, type Row } from '../api'
import { useAuth } from '../auth'
import RevenueChart from '../components/RevenueChart'
import { Badge, PageHead, Stat } from '../components/ui'
import { L, fmtDate, fmtDateTime, money } from '../labels'

export default function Dashboard() {
  const { user } = useAuth()
  const [d, setD] = useState<Row | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/reports/dashboard/').then((r) => setD(r.data)).catch((e) => setError(errorText(e)))
  }, [])

  if (error) return <div className="alert">{error}</div>
  if (!d) return <div className="muted">Yuklanmoqda…</div>
  const f = d.finance

  const stages = Object.keys(L.leadStage) as (keyof typeof L.leadStage)[]
  const leadMax = Math.max(1, ...stages.map((s) => d.leads_by_stage[s] ?? 0))

  return (
    <>
      <PageHead title={`Xush kelibsiz, ${user?.full_name}`} />

      <div className="stats">
        <Stat label="Faol mijozlar" value={d.clients_active} />
        <Stat label="Faol loyihalar" value={d.projects_active} />
        <Stat label="Ochiq vazifalar" value={d.tasks_open} />
        <Stat label="Muddati o'tgan vazifalar" value={d.tasks_overdue} tone={d.tasks_overdue ? 'bad' : undefined} />
      </div>

      {f && (
        <>
          <div className="stats">
            <Stat label="Shu oy tushum" value={money(f.revenue_month)} />
            <Stat label="Shu oy xarajat" value={money(f.expenses_month)} />
            <Stat label="Shu oy foyda" value={money(f.profit_month)} tone={f.profit_month < 0 ? 'bad' : 'good'} />
            <Stat label="Debitor qarzdorlik" value={money(f.receivables)}
              hint={f.overdue_invoices ? <Link to="/invoices">{f.overdue_invoices} ta hisob-faktura muddati o'tgan</Link> : undefined}
              tone={f.overdue_invoices ? 'warn' : undefined} />
          </div>
          <section className="card">
            <h3>Tushum va xarajat — so'nggi 6 oy</h3>
            <RevenueChart data={f.by_month} />
          </section>
        </>
      )}

      <div className="grid-2">
        <section className="card">
          <h3>Mening vazifalarim</h3>
          {d.my_tasks.length === 0 ? <p className="muted">Ochiq vazifalar yo'q</p> : (
            <ul className="list">
              {d.my_tasks.map((t: Row) => (
                <li key={t.id}>
                  <div>
                    <Link to={`/tasks?open=${t.id}`}>{t.title}</Link>
                    <div className="muted small">{t.project__name}</div>
                  </div>
                  <div className="list-meta">
                    <Badge value={t.priority} label={L.priority[t.priority as keyof typeof L.priority]} />
                    <span className="small">{fmtDate(t.due_date)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h3>Yaqin 7 kunlik kontent</h3>
          {d.upcoming_posts.length === 0 ? <p className="muted">Rejalashtirilgan kontent yo'q</p> : (
            <ul className="list">
              {d.upcoming_posts.map((p: Row) => (
                <li key={p.id}>
                  <div>
                    <Link to="/content">{p.title}</Link>
                    <div className="muted small">{p.project__name} · {L.postPlatform[p.platform as keyof typeof L.postPlatform]}</div>
                  </div>
                  <div className="list-meta">
                    <Badge value={p.status} label={L.postStatus[p.status as keyof typeof L.postStatus]} />
                    <span className="small">{fmtDateTime(p.publish_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h3>Lidlar voronkasi</h3>
          <div className="funnel">
            {stages.map((s) => (
              <div key={s} className="funnel-row">
                <span className="funnel-label">{L.leadStage[s]}</span>
                <div className="funnel-track">
                  <div className="funnel-bar" style={{ width: `${((d.leads_by_stage[s] ?? 0) / leadMax) * 100}%` }} />
                </div>
                <span className="funnel-n">{d.leads_by_stage[s] ?? 0}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h3>Vazifalar holati</h3>
          <div className="stats stats-mini">
            {(Object.keys(L.taskStatus) as (keyof typeof L.taskStatus)[]).map((s) => (
              <Stat key={s} label={L.taskStatus[s]} value={d.tasks_by_status[s] ?? 0} />
            ))}
          </div>
          <Link to="/tasks" className="btn">Kanban doskasini ochish →</Link>
        </section>
      </div>
    </>
  )
}
