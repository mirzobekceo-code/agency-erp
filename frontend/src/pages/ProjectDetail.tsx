import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, errorText, type Row } from '../api'
import { useAuth } from '../auth'
import { RecordForm } from '../components/CrudPage'
import { Badge, PageHead, Stat, invalidateRefs } from '../components/ui'
import { L, fmtDate, money, num, todayISO } from '../labels'
import { projectFields } from './simple'
import { TaskBoard } from './Tasks'

const monthStart = () => todayISO().slice(0, 8) + '01'

export default function ProjectDetail() {
  const { id } = useParams()
  const { can, user } = useAuth()
  const [project, setProject] = useState<Row | null>(null)
  const [report, setReport] = useState<Row | null>(null)
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(todayISO())
  const [tab, setTab] = useState<'tasks' | 'report'>('tasks')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')

  const loadProject = useCallback(() => {
    api.get(`/projects/${id}/`).then((r) => setProject(r.data)).catch((e) => setError(errorText(e)))
  }, [id])

  useEffect(() => { loadProject() }, [loadProject])
  useEffect(() => {
    api.get(`/reports/projects/${id}/`, { params: { from, to } }).then((r) => setReport(r.data)).catch((e) => setError(errorText(e)))
  }, [id, from, to])

  if (error) return <div className="alert">{error}</div>
  if (!project) return <div className="muted">Yuklanmoqda…</div>

  return (
    <>
      <div className="crumbs"><Link to="/projects">← Loyihalar</Link></div>
      <PageHead title={project.name}>
        {can('manager') && <button className="btn" onClick={() => setEditing(true)}>Tahrirlash</button>}
      </PageHead>

      <div className="detail-grid card">
        <div><span className="muted">Mijoz</span>{project.client_name}</div>
        <div><span className="muted">Xizmat</span>{project.service_display}</div>
        <div><span className="muted">Holat</span><Badge value={project.status} label={project.status_display} /></div>
        <div><span className="muted">Menejer</span>{project.manager_name ?? '—'}</div>
        <div><span className="muted">Muddat</span>{fmtDate(project.start_date)} — {fmtDate(project.deadline)}</div>
        {user?.can_see_finance && <div><span className="muted">Qiymati / reklama byudjeti</span>{money(project.budget)} / {money(project.ad_budget)}</div>}
      </div>
      {project.description && <p className="pre">{project.description}</p>}

      <div className="tabs">
        <button className={tab === 'tasks' ? 'on' : ''} onClick={() => setTab('tasks')}>Vazifalar</button>
        <button className={tab === 'report' ? 'on' : ''} onClick={() => setTab('report')}>Mijoz uchun hisobot</button>
      </div>

      {tab === 'tasks' && <TaskBoard projectId={project.id} />}

      {tab === 'report' && report && (
        <div className="report">
          <div className="toolbar no-print">
            <label className="inline">Dan <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="inline">Gacha <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <button className="btn" onClick={() => window.print()}>Chop etish / PDF</button>
          </div>
          <h2 className="print-only">{project.name} — hisobot ({fmtDate(from)} — {fmtDate(to)})</h2>

          <h3>Reklama natijalari</h3>
          <div className="stats">
            <Stat label="Sarflangan" value={money(report.ads.amount)} />
            <Stat label="Ko'rishlar" value={num(report.ads.impressions)} />
            <Stat label="Bosishlar" value={num(report.ads.clicks)} hint={report.ads.ctr != null ? `CTR ${report.ads.ctr}%` : undefined} />
            <Stat label="Lidlar" value={num(report.ads.leads)} hint={report.ads.cpl != null ? `Lid narxi ${money(report.ads.cpl)}` : undefined} />
          </div>
          {report.ads.by_platform.length > 0 && (
            <div className="table-wrap">
              <table className="table compact">
                <thead><tr><th>Platforma</th><th className="r">Sarflangan</th><th className="r">Ko'rishlar</th><th className="r">Bosishlar</th><th className="r">Lidlar</th></tr></thead>
                <tbody>
                  {report.ads.by_platform.map((r: Row) => (
                    <tr key={r.platform}><td>{L.adPlatform[r.platform as keyof typeof L.adPlatform]}</td><td className="r">{money(r.amount)}</td><td className="r">{num(r.impressions)}</td><td className="r">{num(r.clicks)}</td><td className="r">{num(r.leads)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3>Kontent</h3>
          <div className="stats">
            <Stat label="Rejalashtirilgan" value={report.content.planned} />
            <Stat label="E'lon qilingan" value={report.content.published} />
            <Stat label="Qamrov" value={num(report.content.reach)} />
            <Stat label="Faollik" value={num(report.content.engagement)} />
          </div>

          <h3>Ish hajmi</h3>
          <div className="stats">
            <Stat label="Vazifalar" value={`${report.tasks.done} / ${report.tasks.total}`} hint="bajarilgan / jami" />
            <Stat label="Muddati o'tgan" value={report.tasks.overdue} tone={report.tasks.overdue ? 'bad' : undefined} />
            <Stat label="Sarflangan vaqt" value={`${num(report.hours.total)} soat`} />
          </div>

          {report.finance && (
            <div className="no-print">
              <h3>Moliya (ichki, mijozga ko'rsatilmaydi)</h3>
              <div className="stats">
                <Stat label="Hisob-faktura" value={money(report.finance.invoiced)} />
                <Stat label="To'langan" value={money(report.finance.paid)} />
                <Stat label="Xarajatlar" value={money(report.finance.expenses)} />
                <Stat label="Foyda" value={money(report.finance.profit)} tone={report.finance.profit < 0 ? 'bad' : 'good'} />
              </div>
            </div>
          )}
        </div>
      )}

      {editing && (
        <RecordForm title="Loyihani tahrirlash" endpoint="/projects/" fields={projectFields} initial={project}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); invalidateRefs('/projects/'); loadProject() }} />
      )}
    </>
  )
}
