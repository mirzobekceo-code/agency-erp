import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { api, errorText, type Row } from '../api'
import { PageHead, refLabel, useRefOptions } from '../components/ui'

const DAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya']

/** Vaqtlarni HH:MM, summalarni butun son ko'rinishiga keltiradi. */
function normalize(d: Row): Row {
  const out: Row = { ...d }
  for (const k of ['work_start', 'work_end', 'late_limit']) out[k] = String(d[k]).slice(0, 5)
  for (const k of ['usd_rate', 'late_fine', 'late_fine_hard', 'absent_fine', 'early_fine']) out[k] = String(Number(d[k]))
  return out
}

function F({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small className="muted">{hint}</small>}</label>
}

export default function SettingsPage() {
  const [v, setV] = useState<Row | null>(null)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const users = useRefOptions('/users/')

  useEffect(() => {
    api.get('/settings/').then((r) => setV(normalize(r.data))).catch((e) => setError(errorText(e)))
  }, [])

  if (!v) return error ? <div className="alert">{error}</div> : <div className="muted">Yuklanmoqda…</div>
  const set = (k: string, val: unknown) => { setV({ ...v, [k]: val }); setMsg('') }
  const days = String(v.work_days).split(',').filter(Boolean)
  const toggleDay = (i: number) => {
    const s = new Set(days)
    if (s.has(String(i))) s.delete(String(i)); else s.add(String(i))
    set('work_days', [...s].sort().join(','))
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const r = await api.patch('/settings/', { ...v, attendance_manager: v.attendance_manager || null })
      setV(normalize(r.data))
      setMsg('Saqlandi'); setError('')
    } catch (err) { setError(errorText(err)) }
  }

  const num = (k: string) => <input className="input" type="number" min={0} value={v[k]} onChange={(e) => set(k, e.target.value)} />

  return (
    <form onSubmit={save}>
      <PageHead title="Sozlamalar">
        {msg && <span className="saved on-bg">✓ {msg}</span>}
        <button className="btn btn-primary">Saqlash</button>
      </PageHead>
      {error && <div className="alert">{error}</div>}

      <div className="grid-2">
        <section className="card">
          <h3>Agentlik profili</h3>
          <div className="form-grid">
            <F label="Agentlik nomi"><input className="input" value={v.name} onChange={(e) => set('name', e.target.value)} required /></F>
            <F label="Qisqa tavsif"><input className="input" value={v.tagline} onChange={(e) => set('tagline', e.target.value)} /></F>
            <F label="1 $ kursi (so'm)" hint="Dollardagi narxlarni so'mga o'girish uchun">{num('usd_rate')}</F>
          </div>
        </section>

        <section className="card">
          <h3>Oylik va eslatmalar</h3>
          <div className="form-grid">
            <F label="Oylik berish kuni" hint="Masalan 15: 15-oktabrda 15-sentabr – 14-oktabr uchun beriladi">
              <input className="input" type="number" min={1} max={28} value={v.payday} onChange={(e) => set('payday', e.target.value)} />
            </F>
            <F label="Muddatdan necha kun oldin eslatish">{num('remind_days')}</F>
          </div>
        </section>

        <section className="card">
          <h3>Ish vaqti va davomat</h3>
          <div className="form-grid">
            <F label="Ish boshlanishi"><input className="input" type="time" value={v.work_start} onChange={(e) => set('work_start', e.target.value)} /></F>
            <F label="Ish tugashi"><input className="input" type="time" value={v.work_end} onChange={(e) => set('work_end', e.target.value)} /></F>
            <div className="field full">
              <span>Ish kunlari</span>
              <div className="chips">
                {DAYS.map((d, i) => (
                  <button type="button" key={d} className={`chip ${days.includes(String(i)) ? 'on' : ''}`} onClick={() => toggleDay(i)}>{d}</button>
                ))}
              </div>
            </div>
            <F label="Davomatni kim belgilaydi" hint="Rahbardan tashqari yana bitta xodim">
              <select className="input" value={v.attendance_manager ?? ''} onChange={(e) => set('attendance_manager', e.target.value ? Number(e.target.value) : null)}>
                <option value="">— Faqat rahbar —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{refLabel(u)}</option>)}
              </select>
            </F>
          </div>
        </section>

        <section className="card">
          <h3>Jarimalar (so'm)</h3>
          <div className="form-grid">
            <F label="Kechikish">{num('late_fine')}</F>
            <F label="Qattiq kechikish chegarasi"><input className="input" type="time" value={v.late_limit} onChange={(e) => set('late_limit', e.target.value)} /></F>
            <F label="Chegaradan keyin kelsa">{num('late_fine_hard')}</F>
            <F label="Kelmasa (sababsiz)">{num('absent_fine')}</F>
            <F label="Erta ketsa (sababsiz)">{num('early_fine')}</F>
          </div>
        </section>
      </div>
    </form>
  )
}
