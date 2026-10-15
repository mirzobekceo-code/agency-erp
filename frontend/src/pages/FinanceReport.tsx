import { useEffect, useState } from 'react'
import { api, errorText, type Row } from '../api'
import { PageHead, Stat } from '../components/ui'
import { money, todayISO } from '../labels'

export default function FinanceReport() {
  const [from, setFrom] = useState(todayISO().slice(0, 8) + '01')
  const [to, setTo] = useState(todayISO())
  const [d, setD] = useState<Row | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/reports/finance/', { params: { from, to } }).then((r) => { setD(r.data); setError('') }).catch((e) => setError(errorText(e)))
  }, [from, to])

  return (
    <>
      <PageHead title="Moliyaviy hisobot">
        <button className="btn no-print" onClick={() => window.print()}>Chop etish</button>
      </PageHead>
      <div className="toolbar no-print">
        <label className="inline">Dan <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="inline">Gacha <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {error && <div className="alert">{error}</div>}
      {d && (
        <>
          <div className="stats">
            <Stat label="Tushum" value={money(d.revenue)} />
            <Stat label="Xarajat" value={money(d.expenses)} />
            <Stat label="Sof foyda" value={money(d.profit)} tone={d.profit < 0 ? 'bad' : 'good'}
              hint={d.revenue > 0 ? `Rentabellik ${Math.round((d.profit / d.revenue) * 100)}%` : undefined} />
            <Stat label="Debitor qarzdorlik (hozir)" value={money(d.receivables)} />
          </div>
          <div className="grid-2">
            <ReportTable title="Mijozlar bo'yicha tushum" rows={d.revenue_by_client} label={(r) => r.client} total={d.revenue} />
            <ReportTable title="Turkumlar bo'yicha xarajat" rows={d.expenses_by_category} label={(r) => r.label} total={d.expenses} />
            <ReportTable title="Eng daromadli loyihalar" rows={d.top_projects.map((p: Row) => ({ ...p, amount: p.paid }))}
              label={(r) => `${r.name}`} total={d.revenue} />
            <ReportTable title="Xodimlarga to'langan maosh" rows={d.salary_by_employee}
              label={(r) => `${r.name} ${r.surname}`.trim()} />
          </div>
        </>
      )}
    </>
  )
}

function ReportTable({ title, rows, label, total }: { title: string; rows: Row[]; label: (r: Row) => string; total?: number }) {
  return (
    <section className="card">
      <h3>{title}</h3>
      {rows.length === 0 ? <p className="muted">Ma'lumot yo'q</p> : (
        <table className="table compact">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{label(r)}</td>
                <td className="r">{money(r.amount)}</td>
                {total ? <td className="r muted">{Math.round((Number(r.amount) / total) * 100)}%</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
