import { useCallback, useEffect, useState } from 'react'
import { api, errorText, type Row } from '../api'
import { useAuth } from '../auth'
import { Badge, Modal, PageHead, Stat } from '../components/ui'
import { fmtDate, money } from '../labels'

const STATUS: Record<string, [string, string]> = {
  pending: ["To'lanmagan", 'lost'], partial: ['Qisman', 'partial'], paid: ["To'langan", 'paid'],
}

export default function PayrollPage() {
  const { can } = useAuth()
  const edit = can('accountant')
  const [payDate, setPayDate] = useState('')
  const [data, setData] = useState<Row | null>(null)
  const [editing, setEditing] = useState<Row | null>(null)
  const [paying, setPaying] = useState<Row | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api.get('/payroll/', { params: payDate ? { pay_date: payDate } : {} })
      .then((r) => { setData(r.data); setError('') }).catch((e) => setError(errorText(e)))
  }, [payDate])
  useEffect(() => { load() }, [load])

  const shift = (n: number) => {
    if (!data) return
    const d = new Date(data.pay_date + 'T12:00:00')
    d.setMonth(d.getMonth() + n)
    setPayDate(d.toISOString().slice(0, 10))
  }

  return (
    <>
      <PageHead title="Oylik vedomost" />
      {error && <div className="alert">{error}</div>}
      {data && (
        <>
          <div className="toolbar">
            <div className="month-nav">
            <button className="btn" onClick={() => shift(-1)}>←</button>
            <div className="day-title">
              <strong>Oylik: {fmtDate(data.pay_date)}</strong>
              <span>{fmtDate(data.period_start)} – {fmtDate(data.period_end)} ishlangani uchun</span>
            </div>
            <button className="btn" onClick={() => shift(1)}>→</button>
            </div>
          </div>
          <div className="stats">
            <Stat label="Jami hisoblangan" value={money(data.total)} />
            <Stat label="To'langan" value={money(data.paid)} tone="good" />
            <Stat label="Qoldiq" value={money(data.balance)} tone={Number(data.balance) > 0 ? 'bad' : undefined} />
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Xodim</th><th className="r">Fiks oylik</th><th className="r">Jarima</th><th className="r">Kechirildi</th>
                  <th className="r">Bonus</th><th className="r">Avans/ushlanma</th><th className="r">Beriladi</th>
                  <th className="r">To'langan</th><th>Holat</th>{edit && <th />}
                </tr>
              </thead>
              <tbody>
                {data.results.map((e: Row) => (
                  <tr key={e.id} className={edit ? 'clickable' : ''} onClick={() => edit && setEditing(e)}>
                    <td><div className="att-name">{e.user_name}</div><div className="muted small">{e.position}</div></td>
                    <td className="r">{money(e.base_salary)}</td>
                    <td className="r">{Number(e.fines) ? <span className="text-bad">−{money(e.fines)}</span> : '—'}</td>
                    <td className="r">{Number(e.fines_waived) ? `+${money(e.fines_waived)}` : '—'}</td>
                    <td className="r">{Number(e.bonus) ? `+${money(e.bonus)}` : '—'}</td>
                    <td className="r">{Number(e.advance) ? `−${money(e.advance)}` : '—'}</td>
                    <td className="r"><b>{money(e.net)}</b></td>
                    <td className="r">{money(e.paid_amount)}</td>
                    <td><Badge value={STATUS[e.status][1]} label={STATUS[e.status][0]} /></td>
                    {edit && (
                      <td className="row-actions" onClick={(ev) => ev.stopPropagation()}>
                        {Number(e.balance) > 0 && <button className="btn-link" onClick={() => setPaying(e)}>To'lash</button>}
                      </td>
                    )}
                  </tr>
                ))}
                {data.results.length === 0 && (
                  <tr><td colSpan={10} className="empty">Oylik belgilangan xodim yo'q. Jamoa → xodim → "Oylik maosh" ni to'ldiring.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="hint">
            Fiks oylik xodim kartochkasidan, jarimalar davomatdan avtomatik olinadi. Qatorni bosib bonus, avans yoki
            kechirilgan jarimani kiriting. "To'lash" bosilganda summa Xarajatlar bo'limiga "Maosh" bo'lib yoziladi.
          </p>
        </>
      )}
      {editing && <EditEntry entry={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
      {paying && <PayEntry entry={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); load() }} />}
    </>
  )
}

function EditEntry({ entry, onClose, onSaved }: { entry: Row; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ bonus: entry.bonus, advance: entry.advance, fines_waived: entry.fines_waived, note: entry.note })
  const [error, setError] = useState('')
  const save = async () => {
    try { await api.patch(`/payroll/${entry.id}/`, v); onSaved() } catch (e) { setError(errorText(e)) }
  }
  return (
    <Modal title={`${entry.user_name}: oylik`} onClose={onClose}>
      <div className="form-grid">
        <label className="field"><span>Bonus</span><input className="input" type="number" min={0} value={v.bonus} onChange={(e) => setV({ ...v, bonus: e.target.value })} /></label>
        <label className="field"><span>Avans / ushlanma</span><input className="input" type="number" min={0} value={v.advance} onChange={(e) => setV({ ...v, advance: e.target.value })} /></label>
        <label className="field"><span>Kechirilgan jarima (jami {money(entry.fines)})</span><input className="input" type="number" min={0} max={entry.fines} value={v.fines_waived} onChange={(e) => setV({ ...v, fines_waived: e.target.value })} /></label>
        <label className="field"><span>Izoh</span><input className="input" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></label>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="form-actions">
        <button className="btn" onClick={onClose}>Bekor qilish</button>
        <button className="btn btn-primary" onClick={save}>Saqlash</button>
      </div>
    </Modal>
  )
}

function PayEntry({ entry, onClose, onSaved }: { entry: Row; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(String(Number(entry.balance)))
  const [error, setError] = useState('')
  const pay = async () => {
    try { await api.post(`/payroll/${entry.id}/pay/`, { amount }); onSaved() } catch (e) { setError(errorText(e)) }
  }
  return (
    <Modal title={`${entry.user_name}: maosh to'lash`} onClose={onClose}>
      <p className="muted">Qoldiq: {money(entry.balance)}</p>
      <label className="field"><span>Summa</span><input className="input" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></label>
      {error && <div className="alert">{error}</div>}
      <div className="form-actions">
        <button className="btn" onClick={onClose}>Bekor qilish</button>
        <button className="btn btn-primary" onClick={pay}>To'lash</button>
      </div>
    </Modal>
  )
}
