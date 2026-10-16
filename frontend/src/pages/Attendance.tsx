import { useCallback, useEffect, useState } from 'react'
import { api, errorText, type Row } from '../api'
import { PageHead, Stat } from '../components/ui'
import { money, todayISO } from '../labels'

const STATUSES: Record<string, string> = {
  '': '— belgilanmagan', present: 'Keldi', absent: 'Kelmadi', excused: 'Sababli', day_off: 'Dam olish',
}
const WD = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba']
const WD_SHORT = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya']
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr']

const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : '')
const nowHHMM = () => new Date().toTimeString().slice(0, 5)
const shiftDay = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export default function AttendancePage() {
  const [tab, setTab] = useState<'day' | 'month'>('day')
  return (
    <>
      <PageHead title="Davomat" />
      <div className="tabs">
        <button className={tab === 'day' ? 'on' : ''} onClick={() => setTab('day')}>Kunlik belgilash</button>
        <button className={tab === 'month' ? 'on' : ''} onClick={() => setTab('month')}>Oylik hisobot</button>
      </div>
      {tab === 'day' ? <DayView /> : <MonthView />}
    </>
  )
}

function DayView() {
  const [date, setDate] = useState(todayISO())
  const [data, setData] = useState<Row | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const apply = (d: Row) => {
    setData(d)
    setRows(d.rows.map((r: Row) => ({ ...r, check_in: hhmm(r.check_in), check_out: hhmm(r.check_out) })))
    setDirty(false)
  }

  const load = useCallback(() => {
    api.get('/attendance/day/', { params: { date } }).then((r) => { apply(r.data); setError('') })
      .catch((e) => setError(errorText(e)))
  }, [date])
  useEffect(() => { load() }, [load])

  const set = (i: number, patch: Row) => {
    setRows((rs) => rs.map((r, j) => {
      if (j !== i) return r
      const next = { ...r, ...patch }
      // Vaqt yozilsa holat o'zi "Keldi" bo'ladi
      if ((patch.check_in || patch.check_out) && !next.status) next.status = 'present'
      if (patch.status && patch.status !== 'present') { next.check_in = ''; next.check_out = '' }
      return next
    }))
    setDirty(true)
    setMsg('')
  }

  const save = async () => {
    try {
      const r = await api.post('/attendance/day/', {
        date,
        rows: rows.map((r) => ({
          user: r.user, status: r.status, check_in: r.check_in || null, check_out: r.check_out || null,
          left_with_permission: r.left_with_permission, note: r.note,
        })),
      })
      apply(r.data)
      setMsg('Saqlandi')
    } catch (e) { setError(errorText(e)) }
  }

  const allDayOff = () => { rows.forEach((_, i) => set(i, { status: 'day_off' })) }

  if (!data) return error ? <div className="alert">{error}</div> : <div className="muted">Yuklanmoqda…</div>
  const d = new Date(date + 'T12:00:00')
  const isToday = date === todayISO()
  const st = data.stats
  const edit = data.can_edit

  return (
    <>
      <div className="toolbar">
        <button className="btn" onClick={() => setDate(shiftDay(date, -1))} aria-label="Oldingi kun">←</button>
        <div className="day-title">
          <strong>{d.getDate()}-{MONTHS[d.getMonth()]}</strong>
          <span>{WD[(d.getDay() + 6) % 7]}{isToday ? ' · bugun' : ''}{!data.is_workday ? ' · dam olish kuni' : ''}</span>
        </div>
        <button className="btn" onClick={() => setDate(shiftDay(date, 1))} aria-label="Keyingi kun">→</button>
        <input className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        {!isToday && <button className="btn" onClick={() => setDate(todayISO())}>Bugun</button>}
      </div>

      <div className="stats">
        <Stat label="O'z vaqtida keldi" value={st.on_time ?? 0} tone="good" />
        <Stat label="Kech keldi" value={st.late ?? 0} hint={`${money(data.fines.late)} / ${money(data.fines.late_hard)} jarima`} />
        <Stat label="Kelmadi" value={st.absent ?? 0} hint={`${money(data.fines.absent)} jarima`} />
        <Stat label="Erta ketdi" value={st.early ?? 0} hint={`${money(data.fines.early)} jarima`} />
        <Stat label="Belgilanmagan" value={st.unmarked ?? 0} tone={st.unmarked ? 'bad' : undefined} />
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="table-wrap">
        <table className="table att-table">
          <thead>
            <tr><th>Xodim</th><th>Holat</th><th>Keldi</th><th>Ketdi</th><th>Izoh</th><th className="r">Jarima</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.user}>
                <td><div className="att-name">{r.name}</div><div className="muted small">{r.position}</div></td>
                <td>
                  <select className={`input att-st st-${r.status || 'none'}`} value={r.status} disabled={!edit}
                    onChange={(e) => set(i, { status: e.target.value })}>
                    {Object.entries(STATUSES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </td>
                <td>
                  <div className="time-cell">
                    <input className="input" type="time" value={r.check_in} disabled={!edit}
                      onChange={(e) => set(i, { check_in: e.target.value })} />
                    {edit && isToday && <button className="btn-mini" onClick={() => set(i, { check_in: nowHHMM() })}>hozir</button>}
                  </div>
                  {r.late && <div className="small text-warn">kechikdi</div>}
                </td>
                <td>
                  <div className="time-cell">
                    <input className="input" type="time" value={r.check_out} disabled={!edit}
                      onChange={(e) => set(i, { check_out: e.target.value })} />
                    {edit && isToday && <button className="btn-mini" onClick={() => set(i, { check_out: nowHHMM() })}>hozir</button>}
                  </div>
                  <label className="small check">
                    <input type="checkbox" checked={!!r.left_with_permission} disabled={!edit}
                      onChange={(e) => set(i, { left_with_permission: e.target.checked })} /> sababli ketdi
                  </label>
                </td>
                <td><input className="input" placeholder="Izoh: masalan, kasal" value={r.note} disabled={!edit}
                  onChange={(e) => set(i, { note: e.target.value })} /></td>
                <td className="r">{Number(r.fine) ? <span className="text-bad">{money(r.fine)}</span> : '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="empty">Davomatda hisobga olinadigan xodim yo'q</td></tr>}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="form-actions sticky-actions">
          <button className="btn" onClick={allDayOff}>Hammaga dam olish kuni</button>
          {msg && <span className="saved">✓ {msg}</span>}
          <button className="btn btn-primary" onClick={save} disabled={!dirty}>Saqlash</button>
        </div>
      )}
      <p className="hint">
        Vaqtni yozsangiz, holat o'zi «Keldi» bo'ladi. {hhmm(data.work_start)}–{hhmm(data.late_limit)} orasida kelsa — {money(data.fines.late)},
        {' '}{hhmm(data.late_limit)} dan keyin — {money(data.fines.late_hard)}, «Kelmadi» — {money(data.fines.absent)}, «Sababli» — jarimasiz.
        {' '}{hhmm(data.work_end)} dan oldin sababsiz ketsa — {money(data.fines.early)}. Jarimalar oylik vedomostda avtomatik ushlanadi;
        rahbar ularni vedomostda kechirishi mumkin. Summalarni Sozlamalar bo'limida o'zgartirasiz.
      </p>
    </>
  )
}

const CELL: Record<string, [string, string]> = {
  present: ['✓', 'Keldi'], late: ['K', 'Kech keldi'], absent: ['✕', 'Kelmadi'], excused: ['S', 'Sababli'],
  day_off: ['–', 'Dam olish'], none: ['?', 'Belgilanmagan'],
}

function MonthView() {
  const [month, setMonth] = useState(todayISO().slice(0, 7))
  const [data, setData] = useState<Row | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/attendance/month/', { params: { month } }).then((r) => { setData(r.data); setError('') })
      .catch((e) => setError(errorText(e)))
  }, [month])

  return (
    <>
      <div className="toolbar">
        <label className="inline">Oy <input className="input" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></label>
      </div>
      {error && <div className="alert">{error}</div>}
      {data && (
        <div className="table-wrap">
          <table className="table att-month">
            <thead>
              <tr>
                <th className="sticky-col">Xodim</th>
                {data.days.map((d: Row) => (
                  <th key={d.date} className={`c ${d.workday ? '' : 'off'}`}>
                    {Number(d.date.slice(8))}<div className="wd">{WD_SHORT[d.weekday]}</div>
                  </th>
                ))}
                <th className="r">Keldi</th><th className="r">Kech</th><th className="r">Kelmadi</th><th className="r">Jarima</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: Row) => (
                <tr key={r.user}>
                  <td className="sticky-col"><div className="att-name">{r.name}</div><div className="muted small">{r.position}</div></td>
                  {r.cells.map((c: string, i: number) => (
                    <td key={i} className={`c cell-${c || 'empty'} ${data.days[i].workday ? '' : 'off'}`} title={CELL[c]?.[1]}>
                      {CELL[c]?.[0] ?? ''}
                    </td>
                  ))}
                  <td className="r">{(r.totals.present ?? 0) + (r.totals.late ?? 0)}</td>
                  <td className="r">{r.totals.late ?? 0}</td>
                  <td className="r">{r.totals.absent ?? 0}</td>
                  <td className="r">{Number(r.fines) ? <span className="text-bad">{money(r.fines)}</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="legend">
        {Object.entries(CELL).map(([k, [s, l]]) => <span key={k}><i className={`cell-key cell-${k}`}>{s}</i>{l}</span>)}
      </div>
    </>
  )
}
