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
      const r = await api.patch('/settings/', { ...v, attendance_manager: v.attendance_manager || null, telegram_tasks_thread_id: v.telegram_tasks_thread_id || null })
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

      <TelegramSection v={v} set={set} onSaved={(d) => setV(normalize(d))} />
    </form>
  )
}

const TG_FLAGS: [string, string][] = [
  ['tg_task_created', 'Xodimga yangi vazifa yozilganda (ijrochi @username bilan belgilanadi)'],
  ['tg_deadline_reminder', 'Muddatga oz qolganda eslatma'],
  ['tg_daily_digest', 'Har kuni ish boshida xulosa (bugungi va kechikkan vazifalar)'],
]

function TelegramSection({ v, set, onSaved }: { v: Row; set: (k: string, val: unknown) => void; onSaved: (d: Row) => void }) {
  const [token, setToken] = useState('')
  const [found, setFound] = useState<Row[] | null>(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name); setMsg(''); setErr('')
    try { await fn() } catch (e) { setErr(errorText(e)) } finally { setBusy('') }
  }
  const saveTg = () => run('save', async () => {
    const payload: Row = { telegram_chat_id: v.telegram_chat_id, telegram_tasks_thread_id: v.telegram_tasks_thread_id || null,
      telegram_chat_title: v.telegram_chat_title }
    for (const [k] of TG_FLAGS) payload[k] = v[k]
    payload.reminder_hours = Number(v.reminder_hours) || 2
    if (token) payload.telegram_bot_token = token.trim()
    const r = await api.patch('/settings/', payload)
    onSaved(r.data); setToken(''); setMsg('Telegram sozlamalari saqlandi')
  })
  const discover = () => run('discover', async () => {
    if (token) { const r = await api.patch('/settings/', { telegram_bot_token: token.trim() }); onSaved(r.data); setToken('') }
    const r = await api.get('/telegram/discover/')
    setFound(r.data)
  })
  const pick = (f: Row) => {
    set('telegram_chat_id', f.chat_id); set('telegram_tasks_thread_id', f.thread_id ?? ''); set('telegram_chat_title', f.chat_title)
    setFound(null); setMsg(`Tanlandi: ${f.chat_title}${f.topic_name ? ' → ' + f.topic_name : ''}. Endi "Saqlash" ni bosing.`)
  }
  const test = () => run('test', async () => { const r = await api.post('/telegram/test/'); setMsg(r.data.detail) })

  return (
    <section className="card tg-card">
      <div className="card-head">
        <h3>Telegram bildirishnomalari</h3>
        <span className={`badge ${v.telegram_configured && v.telegram_chat_id ? 'badge-good' : 'badge-muted'}`}>
          {v.telegram_configured && v.telegram_chat_id ? `Ulangan: ${v.telegram_chat_title || v.telegram_chat_id}` : 'Ulanmagan'}
        </span>
      </div>
      <ol className="tg-steps">
        <li>Telegram'da <b>@BotFather</b> ga <code>/newbot</code> yozib bot yarating va bergan <b>tokenni</b> pastga qo'ying.</li>
        <li>Botni <b>"Menejment"</b> guruhiga qo'shing va <b>admin</b> qiling (xabar yozish huquqi bilan).</li>
        <li><b>"Vazifalar"</b> topic'iga kiring va <code>/start</code> deb yozing.</li>
        <li><b>"Guruhni aniqlash"</b> ni bosing → "Vazifalar" qatorida <b>Tanlash</b> → <b>Saqlash</b> → <b>Sinov xabari</b>.</li>
      </ol>
      <div className="form-grid">
        <label className="field full"><span>Bot tokeni</span>
          <input className="input" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)}
            placeholder={v.telegram_configured ? '•••••••• saqlangan (o\'zgartirish uchun yangisini yozing)' : '123456789:AA...'} />
        </label>
        <label className="field"><span>Guruh ID</span><input className="input" value={v.telegram_chat_id ?? ''} onChange={(e) => set('telegram_chat_id', e.target.value)} placeholder="-100…" /></label>
        <label className="field"><span>Topic ID ("Vazifalar")</span><input className="input" type="number" value={v.telegram_tasks_thread_id ?? ''} onChange={(e) => set('telegram_tasks_thread_id', e.target.value)} /></label>
      </div>
      <div className="tg-actions">
        <button type="button" className="btn" onClick={discover} disabled={!!busy}>{busy === 'discover' ? 'Qidirilmoqda…' : '🔍 Guruhni aniqlash'}</button>
        <button type="button" className="btn btn-primary" onClick={saveTg} disabled={!!busy}>Saqlash</button>
        <button type="button" className="btn" onClick={test} disabled={!!busy || !v.telegram_chat_id}>{busy === 'test' ? 'Yuborilmoqda…' : '📨 Sinov xabari'}</button>
      </div>
      {found && (
        <div className="tg-found">
          {found.length === 0 ? (
            <p className="muted">Hech narsa topilmadi. Bot guruhga qo'shilganini tekshiring va "Vazifalar" topic'iga <code>/start</code> yozib, qayta bosing.</p>
          ) : found.map((f) => (
            <div key={`${f.chat_id}-${f.thread_id}`} className="tg-row">
              <div><b>{f.chat_title}</b> → {f.topic_name || (f.thread_id ? `topic #${f.thread_id}` : 'Umumiy (General)')}
                <div className="muted small">ID {f.chat_id}{f.thread_id ? ` · topic ${f.thread_id}` : ''}{f.last_text ? ` · "${f.last_text}"` : ''}</div>
              </div>
              <button type="button" className="btn" onClick={() => pick(f)}>Tanlash</button>
            </div>
          ))}
        </div>
      )}
      <div className="tg-flags">
        {TG_FLAGS.map(([k, l]) => (
          <label key={k} className="check"><input type="checkbox" checked={!!v[k]} onChange={(e) => set(k, e.target.checked)} /> {l}
            {k === 'tg_deadline_reminder' && (
              <span className="inline-num">— muddatdan <input className="input" type="number" min={1} max={48} value={v.reminder_hours ?? 2}
                onChange={(e) => set('reminder_hours', e.target.value)} onClick={(e) => e.preventDefault()} /> soat oldin</span>
            )}
          </label>
        ))}
        <small className="muted">Xabarda xodim belgilanishi uchun Jamoa → xodim kartochkasidagi "Telegram" maydoniga uning @username'ini yozing.
          Tasdiqlash, qaytarish va izohlar Telegram'ga yuborilmaydi — ular platformada.</small>
      </div>
      {v.cron_url && (
        <p className="muted small">
          <b>Muddat eslatmalari ishlashi uchun</b> <a href="https://cron-job.org" target="_blank" rel="noreferrer">cron-job.org</a> da
          bepul vazifa yarating: <b>har 10 daqiqada</b> shu manzilni chaqirsin (bu serverni uyg'oq ham tutadi):
          <code className="tg-cron">{v.cron_url}</code>
        </p>
      )}
      {msg && <div className="saved">✓ {msg}</div>}
      {err && <div className="alert">{err}</div>}
    </section>
  )
}
