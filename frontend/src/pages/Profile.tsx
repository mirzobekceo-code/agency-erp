import { useEffect, useState, type FormEvent } from 'react'
import { api, errorText, type Row } from '../api'
import { PageHead, Stat } from '../components/ui'
import { fmtDate, money } from '../labels'

export default function ProfilePage() {
  const [me, setMe] = useState<Row | null>(null)
  const [pay, setPay] = useState<Row | null>(null)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [pw, setPw] = useState({ old_password: '', new_password: '', repeat: '' })
  const [pwMsg, setPwMsg] = useState('')
  const [pwError, setPwError] = useState('')

  useEffect(() => {
    api.get('/auth/me/').then((r) => setMe(r.data)).catch((e) => setError(errorText(e)))
    api.get('/payroll/mine/').then((r) => setPay(r.data)).catch(() => {})
  }, [])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const { first_name, last_name, email, phone, telegram } = me!
      setMe((await api.patch('/auth/me/', { first_name, last_name, email, phone, telegram })).data)
      setMsg('Saqlandi'); setError('')
    } catch (err) { setError(errorText(err)) }
  }

  const changePw = async (e: FormEvent) => {
    e.preventDefault()
    setPwMsg(''); setPwError('')
    if (pw.new_password !== pw.repeat) { setPwError('Yangi parollar mos emas'); return }
    try {
      await api.post('/auth/password/', { old_password: pw.old_password, new_password: pw.new_password })
      setPw({ old_password: '', new_password: '', repeat: '' }); setPwMsg('Parol yangilandi')
    } catch (err) { setPwError(errorText(err)) }
  }

  if (!me) return error ? <div className="alert">{error}</div> : <div className="muted">Yuklanmoqda…</div>
  const set = (k: string, v: string) => { setMe({ ...me, [k]: v }); setMsg('') }
  const c = pay?.current

  return (
    <>
      <PageHead title="Profil" />
      <p className="page-sub">{me.position || me.role_display} · login: {me.username}</p>

      {c && Number(c.base_salary) > 0 && (
        <section className="card">
          <h3>Mening oyligim</h3>
          <p className="muted">{fmtDate(c.period_start)} – {fmtDate(c.period_end)} ishlaganim uchun · beriladi {fmtDate(c.pay_date)} · faqat sizga ko'rinadi</p>
          <div className="stats">
            <Stat label="Fiks oylik" value={money(c.base_salary)} />
            <Stat label="Davomat jarimalari (hozircha)" value={money(c.fines)} tone={Number(c.fines) ? 'bad' : undefined} />
            <Stat label="Taxminiy summa" value={money(c.expected)} />
          </div>
          {pay.history.length > 0 && (
            <table className="table compact">
              <thead><tr><th>Oylik sanasi</th><th className="r">Hisoblandi</th><th className="r">To'landi</th></tr></thead>
              <tbody>
                {pay.history.map((h: Row) => (
                  <tr key={h.id}><td>{fmtDate(h.pay_date)}</td><td className="r">{money(h.net)}</td><td className="r">{money(h.paid_amount)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <div className="grid-2">
        <form className="card" onSubmit={save}>
          <h3>Shaxsiy ma'lumotlar</h3>
          <div className="form-grid">
            <label className="field"><span>Ism</span><input className="input" value={me.first_name} onChange={(e) => set('first_name', e.target.value)} /></label>
            <label className="field"><span>Familiya</span><input className="input" value={me.last_name} onChange={(e) => set('last_name', e.target.value)} /></label>
            <label className="field"><span>Email</span><input className="input" type="email" value={me.email} onChange={(e) => set('email', e.target.value)} /></label>
            <label className="field"><span>Telefon</span><input className="input" value={me.phone} onChange={(e) => set('phone', e.target.value)} /></label>
            <label className="field"><span>Telegram</span><input className="input" value={me.telegram} onChange={(e) => set('telegram', e.target.value)} /></label>
          </div>
          {error && <div className="alert">{error}</div>}
          <div className="form-actions">
            {msg && <span className="saved">✓ {msg}</span>}
            <button className="btn btn-primary">Saqlash</button>
          </div>
        </form>

        <form className="card" onSubmit={changePw}>
          <h3>Parolni o'zgartirish</h3>
          <div className="form-grid">
            <label className="field full"><span>Hozirgi parol</span><input className="input" type="password" value={pw.old_password} onChange={(e) => setPw({ ...pw, old_password: e.target.value })} required /></label>
            <label className="field"><span>Yangi parol</span><input className="input" type="password" minLength={8} value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} required /></label>
            <label className="field"><span>Yangi parol (takror)</span><input className="input" type="password" value={pw.repeat} onChange={(e) => setPw({ ...pw, repeat: e.target.value })} required /></label>
          </div>
          <p className="muted small">Kamida 8 belgi.</p>
          {pwError && <div className="alert">{pwError}</div>}
          <div className="form-actions">
            {pwMsg && <span className="saved">✓ {pwMsg}</span>}
            <button className="btn btn-primary">Parolni yangilash</button>
          </div>
        </form>

        <section className="card">
          <h3>Ish ma'lumotlari</h3>
          <div className="detail-grid">
            <div><span className="muted">Rol</span>{me.role_display}</div>
            <div><span className="muted">Ish formati</span>{{ office: 'Ofisda', remote: 'Masofadan', hybrid: 'Aralash' }[me.work_format as string]}</div>
            <div><span className="muted">Xodim turi</span>{{ permanent: 'Doimiy xodim', trial: 'Sinov muddatida', intern: 'Shogird / amaliyotchi', freelance: 'Frilanser' }[me.employee_type as string]}</div>
            <div><span className="muted">Ishga kirgan</span>{fmtDate(me.hired_at)}</div>
          </div>
        </section>
      </div>
    </>
  )
}
