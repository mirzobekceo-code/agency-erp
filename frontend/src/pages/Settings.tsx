import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { api, errorText, type Row } from '../api'
import { PageHead, refLabel, useRefOptions } from '../components/ui'

const DAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya']

/** Vaqtlarni HH:MM, summalarni butun son ko'rinishiga keltiradi. */
function normalize(d: Row): Row {
  const out: Row = { ...d }
  for (const k of ['work_start', 'work_end', 'late_limit', 'shoot_reminder_time']) out[k] = String(d[k]).slice(0, 5)
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

      <TelegramSection v={v} set={set} users={users} onSaved={(d) => setV(normalize(d))} />
    </form>
  )
}

const TG_FLAGS: [string, string][] = [
  ['tg_task_created', 'Xodimga yangi vazifa yozilganda (ijrochi @username bilan belgilanadi)'],
  ['tg_deadline_reminder', 'Muddatga oz qolganda eslatma'],
  ['tg_deadline_buttons', "Eslatmada ijrochidan holatni so'rash: ✅ Tayyor / ⏳ Jarayonda / ⚠️ Kechikadi tugmalari"],
  ['tg_daily_digest', 'Har kuni ish boshida xulosa (bugungi va kechikkan vazifalar)'],
]
const TG_PRIVATE: [string, string][] = [
  ['tg_freelance_dm', "Frilanserga: qaysi ish qabul qilindi va qancha pul qo'shildi / to'landi"],
  ['tg_monthly_kpi', 'Oy oxirida xodimlar samaradorligi hisoboti'],
]
const TG_EXTRA = ['tg_shoot_reminder', 'shoot_reminder_time', 'shoot_reminder_text', 'kpi_recipient']

function TelegramSection({ v, set, users, onSaved }: { v: Row; set: (k: string, val: unknown) => void; users: Row[]; onSaved: (d: Row) => void }) {
  const [botInfo, setBotInfo] = useState<Row | null>(null)
  const loadBot = () => { api.get('/telegram/bot/').then((r) => setBotInfo(r.data)).catch(() => setBotInfo(null)) }
  useEffect(() => { if (v.telegram_configured) loadBot() }, [v.telegram_configured])
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
    for (const [k] of [...TG_FLAGS, ...TG_PRIVATE]) payload[k] = v[k]
    for (const k of TG_EXTRA) payload[k] = v[k] === '' ? null : v[k]
    payload.reminder_hours = Number(v.reminder_hours) || 2
    if (token) payload.telegram_bot_token = token.trim()
    const r = await api.patch('/settings/', payload)
    onSaved(r.data); setToken(''); setMsg('Telegram sozlamalari saqlandi'); loadBot()
  })
  const connectBot = () => run('bot', async () => {
    const r = await api.post('/telegram/bot/'); setBotInfo(r.data); setMsg('Bot ulandi: guruhdagi buyruqlar va tugmalar ishlaydi')
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
            <p className="muted">Bot hali guruhni ko'rmagan. Botni guruhdan <b>chiqarib, qayta qo'shing</b> va admin qiling, keyin
              "Vazifalar" topic'iga <code>/start{botInfo?.username ? '@' + botInfo.username : ''}</code> yozing va shu tugmani qayta bosing.</p>
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
      {botInfo && (
        <div className="tg-bot">
          {botInfo.connected ? (
            <>
              <div>
                🤖 <b>@{botInfo.username}</b> · buyruqlar va tugmalar: {botInfo.webhook_ok ? <span className="text-good">✅ ishlayapti</span> : <span className="text-bad">ulanmagan</span>}
                {' · '}shaxsiy chat ulagan xodimlar: <b>{botInfo.linked_users}</b>
                {botInfo.last_error && <div className="text-bad small">Oxirgi xato: {botInfo.last_error}</div>}
                <div className="small">
                  {botInfo.last_update?.at
                    ? <>Bot oxirgi marta xabar oldi: <b>{new Date(botInfo.last_update.at).toLocaleString('ru-RU')}</b> — {botInfo.last_update.chat_title || (botInfo.last_update.chat_type === 'private' ? 'shaxsiy chat' : botInfo.last_update.chat_id)}
                      {botInfo.last_update.text ? ` · "${botInfo.last_update.text}"` : ''}
                      {botInfo.last_update.error && <span className="text-bad"> · xato: {botInfo.last_update.error}</span>}</>
                    : <span className="muted">Bot ulanganidan beri hali hech qanday xabar kelmagan.</span>}
                  {botInfo.chats?.length > 0 && <> · Bot ko'rgan guruhlar: {botInfo.chats.map((c: Row) => c.title || c.chat_id).join(', ')}</>}
                </div>
                <div className="muted small">Har bir xodim <a href={`https://t.me/${botInfo.username}`} target="_blank" rel="noreferrer">t.me/{botInfo.username}</a> ga kirib <code>/start</code> bossin — shaxsiy xabarlar (frilanser to'lovlari, oylik hisobot) faqat shunda boradi.
                  Guruhda: <code>/vazifa @username Matn ertaga 15:00</code>, <code>/vazifalarim</code>.</div>
              </div>
              {!botInfo.webhook_ok && <button type="button" className="btn btn-primary" onClick={connectBot} disabled={!!busy}>{busy === 'bot' ? 'Ulanmoqda…' : 'Botni ulash'}</button>}
            </>
          ) : <span className="text-bad">Bot javob bermadi: {botInfo.error}</span>}
        </div>
      )}
      <h4>Jamoa guruhiga ("Vazifalar" topic'i)</h4>
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

      <h4>Mijoz guruhlariga — faqat syomka eslatmasi</h4>
      <div className="tg-flags">
        <label className="check"><input type="checkbox" checked={!!v.tg_shoot_reminder} onChange={(e) => set('tg_shoot_reminder', e.target.checked)} /> Kelishilgan syomkadan bir kun oldin, soat
          <span className="inline-num"><input className="input inline-time" type="time" value={v.shoot_reminder_time ?? '10:00'} onChange={(e) => set('shoot_reminder_time', e.target.value)} onClick={(e) => e.preventDefault()} /> da</span>
        </label>
        <label className="field full"><span>Xabar matni</span>
          <textarea className="input" rows={3} value={v.shoot_reminder_text ?? ''} onChange={(e) => set('shoot_reminder_text', e.target.value)} />
          <small className="muted">O'rniga qo'yiladi: <code>{'{sana}'}</code> <code>{'{vaqt}'}</code> <code>{'{joy}'}</code> <code>{'{mijoz}'}</code> <code>{'{agentlik}'}</code>.
            Bot mijoz guruhida boshqa hech narsa yozmaydi va hech kimga javob bermaydi. Guruhni Mijozlar → mijoz kartochkasida tanlang (avval botni o'sha guruhga qo'shing).</small>
        </label>
      </div>

      <h4>Shaxsiy xabarlar (guruhga chiqmaydi)</h4>
      <div className="tg-flags">
        {TG_PRIVATE.map(([k, l]) => (
          <label key={k} className="check"><input type="checkbox" checked={!!v[k]} onChange={(e) => set(k, e.target.checked)} /> {l}</label>
        ))}
        <label className="field"><span>Oylik hisobotni oladi</span>
          <select className="input" value={v.kpi_recipient ?? ''} onChange={(e) => set('kpi_recipient', e.target.value ? Number(e.target.value) : null)}>
            <option value="">— Rahbar (botga /start yozgan birinchi admin) —</option>
            {users.map((u) => <option key={u.id} value={u.id}>{refLabel(u)}{u.telegram_linked ? '' : ' (botga /start yozmagan)'}</option>)}
          </select>
        </label>
      </div>
      {v.cron_url && (
        <p className="muted small">
          <b>Eslatmalar ishlashi uchun</b> shu manzil <b>har 10 daqiqada</b> chaqirilishi kerak (serverni uyg'oq ham tutadi):
          GitHub'dagi repoda <b>Settings → Secrets → Actions</b> ga <code>CRON_URL</code> nomi bilan qo'ying (tayyor workflow bor)
          yoki <a href="https://cron-job.org" target="_blank" rel="noreferrer">cron-job.org</a> da bepul vazifa yarating.
          <code className="tg-cron">{v.cron_url}</code>
        </p>
      )}
      {msg && <div className="saved">✓ {msg}</div>}
      {err && <div className="alert">{err}</div>}
    </section>
  )
}
