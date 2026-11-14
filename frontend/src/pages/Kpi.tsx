import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, errorText, type Row } from '../api'
import { PageHead, Stat } from '../components/ui'
import { money, todayISO } from '../labels'

const MEDAL = ['🥇', '🥈', '🥉']

export default function KpiPage() {
  const [params, setParams] = useSearchParams()
  const month = params.get('month') || todayISO().slice(0, 7)
  const [data, setData] = useState<Row | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/reports/kpi/', { params: { month } }).then((r) => { setData(r.data); setError('') })
      .catch((e) => setError(errorText(e)))
  }, [month])

  return (
    <>
      <PageHead title="Samaradorlik">
        <input className="input" type="month" value={month} onChange={(e) => e.target.value && setParams({ month: e.target.value })} />
      </PageHead>
      <p className="muted">Vazifa ijrochi topshirgan vaqt bo'yicha hisoblanadi (tasdiqlash kutilgani hisobga olinmaydi). Muddati o'tib, hali ochiq turgan vazifalar ham kechikkan sanaladi. Oy oxirida shu hisobot Telegram'da faqat sizga shaxsiy keladi.</p>
      {error && <div className="alert">{error}</div>}
      {data && (
        <>
          <div className="stats">
            <Stat label="Yopilgan vazifalar" value={data.totals.done} />
            <Stat label="O'z vaqtida" value={`${data.totals.on_time_pct}%`} tone={data.totals.on_time_pct >= 80 ? 'good' : data.totals.on_time_pct >= 60 ? undefined : 'bad'} />
            <Stat label="Kechikkan" value={data.totals.late} tone={data.totals.late ? 'bad' : undefined} />
            <Stat label="Frilanserlarga hisoblangan" value={money(data.freelance.accrued)} hint={`Qarzimiz: ${money(data.freelance.unpaid)}`} />
          </div>
          {data.rows.length === 0 ? <div className="card empty">Bu oyda muddatli yoki yopilgan vazifa yo'q</div> : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Xodim</th><th className="r">Yopilgan</th><th className="r">O'z vaqtida</th><th className="r">Kechikkan</th><th className="r">Hali ochiq (muddati o'tgan)</th><th className="r">Qaytarilgan</th><th style={{ minWidth: 150 }}>O'z vaqtida %</th></tr>
                </thead>
                <tbody>
                  {data.rows.map((r: Row, i: number) => (
                    <tr key={r.user}>
                      <td>{r.done > 0 && i < 3 && r.on_time_pct >= 80 ? `${MEDAL[i]} ` : ''}<b>{r.name}</b> <span className="muted small">{r.position}</span></td>
                      <td className="r">{r.done}</td>
                      <td className="r">{r.on_time}</td>
                      <td className={`r ${r.late ? 'text-bad' : ''}`}>{r.late}</td>
                      <td className={`r ${r.overdue_open ? 'text-bad' : ''}`}>{r.overdue_open}</td>
                      <td className="r">{r.returned}</td>
                      <td>
                        <div className="bar"><i style={{ width: `${r.on_time_pct}%` }} className={r.on_time_pct >= 80 ? 'good' : r.on_time_pct >= 60 ? 'warn' : 'bad'} /></div>
                        <span className="small">{r.on_time_pct}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  )
}
