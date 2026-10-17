import { useCallback, useEffect, useState } from 'react'
import { api, errorText, type Paginated, type Row } from '../api'
import { useAuth } from '../auth'
import { Badge, PageHead, useRefOptions } from '../components/ui'
import { L, money, num, todayISO } from '../labels'

const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr']
const STATUS = L.reportStatus as Record<string, string>
const TONE: Record<string, string> = { draft: 'draft', ready: 'proposal', sent: 'paid' }

const prevMonth = () => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const shortNum = (v: number) => (v >= 1e6 ? `${+(v / 1e6).toFixed(1)} M` : v >= 1e3 ? `${Math.round(v / 1e3)} K` : String(v))

export default function ReportsPage() {
  const { user, can } = useAuth()
  const edit = can('manager') || ['smm', 'target', 'copywriter'].includes(user?.job ?? '')
  const [month, setMonth] = useState(prevMonth())
  const [reports, setReports] = useState<Row[]>([])
  const [active, setActive] = useState<Row | null>(null)
  const [project, setProject] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const projects = useRefOptions('/projects/')

  const load = useCallback(async (selectId?: number) => {
    try {
      const r = await api.get<Paginated<Row>>('/client-reports/', { params: { month: `${month}-01`, page_size: 200 } })
      setReports(r.data.results)
      setActive((cur) => r.data.results.find((x) => x.id === (selectId ?? cur?.id)) ?? r.data.results[0] ?? null)
      setError('')
    } catch (e) { setError(errorText(e)) }
  }, [month])
  useEffect(() => { load() }, [load])

  const generate = async () => {
    setBusy(true)
    try {
      const r = await api.post('/client-reports/generate/', { month, project: project || null })
      await load(r.data[0]?.id)
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }

  const [y, m] = month.split('-').map(Number)
  const shift = (n: number) => {
    const d = new Date(y, m - 1 + n, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <>
      <PageHead title="Hisobot">
        {active && <button className="btn" onClick={() => window.print()}>PDF / chop etish</button>}
      </PageHead>
      <p className="page-sub no-print">Mijozlarga oylik hisobotlar. Raqamlar kontent studio va reklama sarflaridan avtomatik olinadi.</p>

      <div className="toolbar no-print">
        <div className="month-nav">
          <button className="btn" onClick={() => shift(-1)} aria-label="Oldingi oy">←</button>
          <div className="day-title"><strong>{MONTHS[m - 1]} {y}</strong><span>{reports.length} ta hisobot</span></div>
          <button className="btn" onClick={() => shift(1)} aria-label="Keyingi oy" disabled={month >= todayISO().slice(0, 7)}>→</button>
        </div>
        {edit && (
          <>
            <select className="input" value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">Barcha faol loyihalar</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button className="btn btn-primary" onClick={generate} disabled={busy}>{busy ? 'Tayyorlanmoqda…' : '+ Yangi hisobot'}</button>
          </>
        )}
      </div>
      {error && <div className="alert">{error}</div>}

      <div className="reports">
        <div className="reports-list card no-print">
          {reports.length === 0 && <p className="muted">Bu oy uchun hisobot yo'q. "+ Yangi hisobot" ni bosing — raqamlar avtomatik to'ldiriladi.</p>}
          {reports.map((r) => (
            <button key={r.id} className={`note-item ${active?.id === r.id ? 'on' : ''}`} onClick={() => setActive(r)}>
              <div className="note-title">{r.client_name}</div>
              <div className="report-row muted small">
                <span>{r.project_name}</span>
                <Badge value={TONE[r.status]} label={STATUS[r.status]} />
              </div>
            </button>
          ))}
        </div>
        {active && <ReportView key={active.id} report={active} editable={edit} onChanged={(id) => load(id)} />}
      </div>
    </>
  )
}

function ReportView({ report, editable, onChanged }: { report: Row; editable: boolean; onChanged: (id: number) => void }) {
  const [r, setR] = useState(report)
  const [editing, setEditing] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const month = new Date(r.month + 'T12:00:00')
  const weeks: number[] = r.weekly_reach?.length ? r.weekly_reach : [0, 0, 0, 0]
  const maxWeek = Math.max(1, ...weeks)
  const cpl = r.ad_leads ? Number(r.ad_spend) / r.ad_leads : null

  const save = async (patch: Row) => {
    try {
      const res = await api.patch(`/client-reports/${r.id}/`, patch)
      setR(res.data); setMsg('Saqlandi'); setError(''); onChanged(r.id)
    } catch (e) { setError(errorText(e)) }
  }
  const refresh = async () => {
    try { const res = await api.post(`/client-reports/${r.id}/refresh/`); setR(res.data); setMsg('Raqamlar yangilandi'); onChanged(r.id) }
    catch (e) { setError(errorText(e)) }
  }
  const set = (k: string, v: unknown) => setR({ ...r, [k]: v })

  return (
    <div className="report-doc card">
      <div className="report-actions no-print">
        <Badge value={TONE[r.status]} label={STATUS[r.status]} />
        {editable && (
          <>
            {!editing && <button className="btn" onClick={() => setEditing(true)}>Tahrirlash</button>}
            {editing && <button className="btn btn-primary" onClick={() => { save({ new_followers: r.new_followers, reach: r.reach, summary: r.summary, next_plan: r.next_plan }); setEditing(false) }}>Saqlash</button>}
            {r.status !== 'sent' && <button className="btn" onClick={refresh} title="Kontent va reklamadan raqamlarni qayta olish">↻ Raqamlarni yangilash</button>}
            {r.status === 'draft' && <button className="btn" onClick={() => save({ status: 'ready' })}>Tayyor ✓</button>}
            {r.status !== 'sent' && <button className="btn" onClick={() => save({ status: 'sent' })}>Mijozga yuborildi</button>}
          </>
        )}
        {msg && <span className="saved">✓ {msg}</span>}
      </div>
      {error && <div className="alert">{error}</div>}

      <div className="doc-head">
        <div>
          <div className="doc-kicker">OYLIK HISOBOT</div>
          <h2>{r.client_name}</h2>
          <div className="muted">{r.project_name} · {MONTHS[month.getMonth()]} {month.getFullYear()}</div>
        </div>
      </div>

      <div className="stats doc-kpis">
        <div className="stat">
          <div className="stat-label">Qamrov</div>
          {editing ? <input className="input" type="number" value={r.reach} onChange={(e) => set('reach', e.target.value)} />
            : <div className="stat-value big">{shortNum(Number(r.reach))}</div>}
          <div className="stat-hint">ko'rishlar yig'indisi</div>
        </div>
        <div className="stat">
          <div className="stat-label">Yangi obunachilar</div>
          {editing ? <input className="input" type="number" value={r.new_followers} onChange={(e) => set('new_followers', e.target.value)} />
            : <div className="stat-value big">{num(r.new_followers)}</div>}
          <div className="stat-hint">shu oy (qo'lda kiritiladi)</div>
        </div>
        <div className="stat">
          <div className="stat-label">Nashrlar</div>
          <div className="stat-value big">{r.posts_published}</div>
          <div className="stat-hint">{r.posts_planned} ta rejadan</div>
        </div>
      </div>

      <div className="doc-grid">
        <section>
          <h3>Haftalik qamrov</h3>
          <div className="week-bars" role="img" aria-label="Haftalik qamrov">
            {weeks.map((w, i) => (
              <div key={i} className="week-bar">
                <span className="week-val">{shortNum(w)}</span>
                <span className="week-col"><span style={{ height: `${(w / maxWeek) * 100}%` }} /></span>
                <span className="muted small">{i + 1}-hafta</span>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3>Eng yaxshi kontent</h3>
          {r.top_content?.length ? (
            <ol className="top-list">
              {r.top_content.map((t: Row, i: number) => (
                <li key={i}><span className="top-n">{i + 1}</span><span className="top-title">{t.title}<small className="muted"> · {t.type}</small></span><b>{shortNum(t.reach)}</b></li>
              ))}
            </ol>
          ) : <p className="muted">Bu oyda nashr qilingan kontent qamrovi kiritilmagan</p>}
        </section>
      </div>

      <h3>Reklama natijasi</h3>
      <div className="stats doc-kpis">
        <div className="stat"><div className="stat-label">Reklamaga sarflandi</div><div className="stat-value">{money(r.ad_spend)}</div></div>
        <div className="stat"><div className="stat-label">Lidlar</div><div className="stat-value">{num(r.ad_leads)}</div><div className="stat-hint">so'rov / murojaat</div></div>
        <div className="stat"><div className="stat-label">1 lid narxi</div><div className="stat-value">{cpl ? money(cpl) : '—'}</div></div>
      </div>
      {r.campaigns?.length > 0 && (
        <table className="table compact">
          <thead><tr><th>Kampaniya</th><th className="r">Sarflandi</th><th className="r">Qamrov</th><th className="r">Bosishlar</th><th className="r">Lidlar</th><th className="r">1 lid narxi</th></tr></thead>
          <tbody>
            {r.campaigns.map((c: Row, i: number) => (
              <tr key={i}>
                <td>{c.name}</td><td className="r">{money(c.spend)}</td><td className="r">{shortNum(c.reach)}</td>
                <td className="r">{num(c.clicks)}</td><td className="r">{num(c.leads)}</td>
                <td className="r">{c.leads ? money(c.spend / c.leads) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="doc-grid">
        <section>
          <h3>Xulosa</h3>
          {editing ? <textarea className="input" rows={5} value={r.summary} onChange={(e) => set('summary', e.target.value)} placeholder="Oy natijalari haqida qisqacha…" />
            : <p className="pre">{r.summary || <span className="muted">Xulosa yozilmagan</span>}</p>}
        </section>
        <section>
          <h3>Keyingi oy rejasi</h3>
          {editing ? <textarea className="input" rows={5} value={r.next_plan} onChange={(e) => set('next_plan', e.target.value)} placeholder="Keyingi oyda nimalar qilinadi…" />
            : <p className="pre">{r.next_plan || <span className="muted">Reja yozilmagan</span>}</p>}
        </section>
      </div>
    </div>
  )
}
