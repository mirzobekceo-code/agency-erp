import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, errorText, type Paginated, type Row } from '../api'
import { useAuth } from '../auth'
import { Badge, Modal, PageHead, Stat, refLabel, useRefOptions } from '../components/ui'
import { fmtDate, money, todayISO } from '../labels'

const PAY_MODE: Record<string, string> = { now: 'Darhol', month: 'Oy oxirida' }

export default function FreelancePage() {
  const { can } = useAuth()
  const staff = can('accountant', 'hr', 'manager')
  return staff ? <FreelanceAdmin /> : <MyWorks />
}

/** Frilanserning o'zi: qilgan ishlari va qancha to'lanmagani. */
function MyWorks() {
  const [works, setWorks] = useState<Row[]>([])
  const [sum, setSum] = useState<Row | null>(null)
  useEffect(() => {
    api.get<Paginated<Row>>('/piece-works/', { params: { page_size: 100 } }).then((r) => setWorks(r.data.results))
    api.get('/piece-works/summary/').then((r) => setSum(r.data))
  }, [])
  return (
    <>
      <PageHead title="Mening ishlarim" />
      <div className="stats">
        <Stat label="Darhol to'lanadi" value={money(sum?.unpaid_now ?? 0)} />
        <Stat label="Oy oxirida to'lanadi" value={money(sum?.unpaid_month ?? 0)} />
        <Stat label="Shu oy to'langan" value={money(sum?.paid_month ?? 0)} tone="good" />
      </div>
      <WorksTable rows={works} />
    </>
  )
}

function WorksTable({ rows, selected, onToggle, showUser }: {
  rows: Row[]; selected?: Set<number>; onToggle?: (id: number) => void; showUser?: boolean
}) {
  if (!rows.length) return <div className="card empty">Ishlar yo'q</div>
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {onToggle && <th />}
            <th>Sana</th>{showUser && <th>Xodim</th>}<th>Ish</th><th>Loyiha</th><th className="r">Summa</th><th>To'lov</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => (
            <tr key={w.id} className={onToggle && !w.paid_at ? 'clickable' : ''} onClick={() => onToggle && !w.paid_at && onToggle(w.id)}>
              {onToggle && <td>{!w.paid_at && <input type="checkbox" checked={selected?.has(w.id) ?? false} readOnly />}</td>}
              <td>{fmtDate(w.date)}</td>
              {showUser && <td>{w.user_name}</td>}
              <td>{w.title}{Number(w.quantity) !== 1 && <span className="muted"> × {Number(w.quantity)}</span>}
                {w.task && <div className="muted small">vazifa tasdiqlanganda avtomatik</div>}</td>
              <td>{w.project_name ?? <span className="muted">—</span>}</td>
              <td className="r">{money(w.amount)}</td>
              <td>{w.paid_at
                ? <Badge value="paid" label={`To'landi ${fmtDate(w.paid_at)}`} />
                : <Badge value={w.pay_mode === 'now' ? 'urgent' : 'draft'} label={PAY_MODE[w.pay_mode]} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FreelanceAdmin() {
  const { can } = useAuth()
  const canPay = can('accountant')
  const [tab, setTab] = useState<'unpaid' | 'history' | 'rates'>('unpaid')
  const [sum, setSum] = useState<Row | null>(null)
  const [works, setWorks] = useState<Row[]>([])
  const [userFilter, setUserFilter] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    const params: Record<string, string | number> = { page_size: 300 }
    if (tab === 'unpaid') params.paid_at__isnull = 'true'
    if (userFilter) params.user = userFilter
    Promise.all([api.get('/piece-works/summary/'), api.get<Paginated<Row>>('/piece-works/', { params })])
      .then(([s, w]) => { setSum(s.data); setWorks(w.data.results); setSelected(new Set()); setError('') })
      .catch((e) => setError(errorText(e)))
  }, [tab, userFilter])
  useEffect(() => { if (tab !== 'rates') load() }, [load, tab])

  const pay = async (body: Row, what: string) => {
    if (!confirm(`${what} to'langan deb belgilansinmi? Xarajatlarga "Frilanser" sifatida yoziladi va xodimga Telegram'da shaxsiy xabar boradi.`)) return
    try {
      const r = await api.post('/piece-works/pay/', body)
      alert(`${r.data.paid} ta ish to'landi: ${money(r.data.amount)}`)
      load()
    } catch (e) { alert(errorText(e)) }
  }
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const selectedSum = works.filter((w) => selected.has(w.id)).reduce((a, w) => a + Number(w.amount), 0)

  return (
    <>
      <PageHead title="Frilanserlar">
        {canPay && <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Ish qo'shish</button>}
      </PageHead>
      <p className="muted">Operator va montajorlarning donabay ishlari. Vazifaga donabay narx biriktirilsa, vazifa tasdiqlanganda pul avtomatik yoziladi. Ish va to'lov haqidagi xabar frilanserga faqat Telegram'da shaxsiy keladi.</p>
      {error && <div className="alert">{error}</div>}
      <div className="stats">
        <Stat label="Darhol to'lanadigan" value={money(sum?.unpaid_now ?? 0)} tone={Number(sum?.unpaid_now) > 0 ? 'bad' : undefined} />
        <Stat label="Oy oxirida to'lanadigan" value={money(sum?.unpaid_month ?? 0)} />
        <Stat label="Shu oy to'langan" value={money(sum?.paid_month ?? 0)} tone="good" />
      </div>

      {sum && sum.rows.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Frilanser</th><th className="r">Darhol</th><th className="r">Oy oxirida</th><th className="r">Jami qarz</th><th className="r">Shu oy to'langan</th>{canPay && <th />}</tr></thead>
            <tbody>
              {sum.rows.map((r: Row) => (
                <tr key={r.user}>
                  <td>{r.name} <span className="muted small">{r.position}</span>
                    {!r.telegram_linked && <div className="muted small">Telegram ulanmagan — botga /start yozishi kerak</div>}</td>
                  <td className={`r ${Number(r.now) > 0 ? 'text-bad' : ''}`}>{money(r.now)}</td>
                  <td className="r">{money(r.month)}</td>
                  <td className="r"><b>{money(r.unpaid)}</b></td>
                  <td className="r">{money(r.paid_month)}</td>
                  {canPay && (
                    <td className="r nowrap">
                      {Number(r.now) > 0 && <button className="btn btn-sm" onClick={() => pay({ user: r.user, pay_mode: 'now' }, `${r.name}: ${money(r.now)}`)}>Darholni to'lash</button>}
                      {Number(r.unpaid) > 0 && <button className="btn btn-sm" onClick={() => pay({ user: r.user }, `${r.name}: hammasi (${money(r.unpaid)})`)}>Hammasini to'lash</button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="toolbar">
        <div className="pills">
          <button className={tab === 'unpaid' ? 'on' : ''} onClick={() => setTab('unpaid')}>To'lanmagan ishlar</button>
          <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>Barcha ishlar</button>
          <button className={tab === 'rates' ? 'on' : ''} onClick={() => setTab('rates')}>Narxlar</button>
        </div>
        {tab !== 'rates' && <FreelancerSelect value={userFilter} onChange={setUserFilter} />}
        {canPay && tab === 'unpaid' && selected.size > 0 && (
          <button className="btn btn-primary" onClick={() => pay({ ids: [...selected] }, `Tanlangan ${selected.size} ta ish (${money(selectedSum)})`)}>
            Tanlanganlarni to'lash · {money(selectedSum)}
          </button>
        )}
      </div>
      {tab === 'rates' ? <Rates canEdit={canPay} /> : (
        <WorksTable rows={works} showUser selected={selected} onToggle={canPay && tab === 'unpaid' ? toggle : undefined} />
      )}
      {adding && <AddWork onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
    </>
  )
}

function useFreelancers() {
  const all = useRefOptions('/users/?is_active=true')
  return useMemo(() => [...all].sort((a, b) => Number(b.employee_type === 'freelance') - Number(a.employee_type === 'freelance')), [all])
}

function FreelancerSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const users = useFreelancers()
  return (
    <select className="input" style={{ maxWidth: 240 }} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Hamma xodimlar</option>
      {users.map((u) => <option key={u.id} value={u.id}>{refLabel(u)}{u.employee_type === 'freelance' ? '' : ' (shtatda)'}</option>)}
    </select>
  )
}

function AddWork({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const users = useFreelancers()
  const projects = useRefOptions('/projects/')
  const [v, setV] = useState<Row>({ user: '', rate: '', title: '', quantity: 1, price: '', pay_mode: 'month', project: '', date: todayISO(), note: '' })
  const [rates, setRates] = useState<Row[]>([])
  const [error, setError] = useState('')
  const set = (k: string, val: unknown) => setV((s) => ({ ...s, [k]: val }))

  useEffect(() => {
    if (!v.user) { setRates([]); return }
    api.get<Row[]>('/work-rates/', { params: { user: v.user, active: true } }).then((r) => setRates(r.data))
  }, [v.user])

  const pickRate = (id: string) => {
    const r = rates.find((x) => String(x.id) === id)
    setV((s) => ({ ...s, rate: id, title: r ? r.title : s.title, price: r ? r.price : s.price }))
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api.post('/piece-works/', { ...v, rate: v.rate || null, project: v.project || null })
      onSaved()
    } catch (err) { setError(errorText(err)) }
  }
  return (
    <Modal title="Donabay ish qo'shish" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="form-grid">
          <label className="field"><span>Xodim *</span>
            <select className="input" required value={v.user} onChange={(e) => setV((s) => ({ ...s, user: e.target.value, rate: '' }))}>
              <option value="">—</option>
              {users.map((u) => <option key={u.id} value={u.id}>{refLabel(u)}</option>)}
            </select>
          </label>
          <label className="field"><span>Ish turi (narxlardan)</span>
            <select className="input" value={v.rate} onChange={(e) => pickRate(e.target.value)} disabled={!rates.length}>
              <option value="">{v.user && !rates.length ? "Narx kiritilmagan" : '—'}</option>
              {rates.map((r) => <option key={r.id} value={r.id}>{r.title} — {money(r.price)}</option>)}
            </select>
          </label>
          <label className="field full"><span>Ish nomi *</span><input className="input" required value={v.title} onChange={(e) => set('title', e.target.value)} /></label>
          <label className="field"><span>Soni</span><input className="input" type="number" step="any" min="0" value={v.quantity} onChange={(e) => set('quantity', e.target.value)} /></label>
          <label className="field"><span>Narxi (1 dona) *</span><input className="input" type="number" step="any" min="0" required value={v.price} onChange={(e) => set('price', e.target.value)} /></label>
          <label className="field"><span>To'lov</span>
            <select className="input" value={v.pay_mode} onChange={(e) => set('pay_mode', e.target.value)}>
              {Object.entries(PAY_MODE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="field"><span>Sana</span><input className="input" type="date" value={v.date} onChange={(e) => set('date', e.target.value)} /></label>
          <label className="field full"><span>Loyiha</span>
            <select className="input" value={v.project} onChange={(e) => set('project', e.target.value)}>
              <option value="">—</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field full"><span>Izoh</span><input className="input" value={v.note} onChange={(e) => set('note', e.target.value)} /></label>
        </div>
        {Number(v.price) > 0 && <p className="muted">Summa: <b>{money(Number(v.price) * Number(v.quantity || 0))}</b></p>}
        {error && <div className="alert pre">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Bekor qilish</button>
          <button className="btn btn-primary">Saqlash</button>
        </div>
      </form>
    </Modal>
  )
}

/** Har bir frilanserning o'z narxlari. */
function Rates({ canEdit }: { canEdit: boolean }) {
  const users = useFreelancers()
  const [rates, setRates] = useState<Row[]>([])
  const [form, setForm] = useState<Row | null>(null)
  const load = useCallback(() => { api.get<Row[]>('/work-rates/').then((r) => setRates(r.data)) }, [])
  useEffect(() => { load() }, [load])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    try {
      if (form!.id) await api.patch(`/work-rates/${form!.id}/`, form)
      else await api.post('/work-rates/', form)
      setForm(null); load()
    } catch (err) { alert(errorText(err)) }
  }
  const remove = async (r: Row) => {
    if (!confirm(`"${r.title}" narxi o'chirilsinmi?`)) return
    await api.delete(`/work-rates/${r.id}/`); load()
  }
  const byUser = users.filter((u) => u.employee_type === 'freelance' || rates.some((r) => r.user === u.id))

  return (
    <>
      {byUser.length === 0 && <div className="card empty">Frilanser yo'q. Jamoa bo'limida xodim turini "Frilanser" qiling.</div>}
      <div className="rate-grid">
        {byUser.map((u) => {
          const mine = rates.filter((r) => r.user === u.id)
          return (
            <div key={u.id} className="card">
              <div className="card-head"><h3>{refLabel(u)}</h3><span className="muted small">{u.position}</span></div>
              {mine.length === 0 && <div className="muted small">Narx kiritilmagan</div>}
              {mine.map((r) => (
                <div key={r.id} className={`rate-row ${r.active ? '' : 'muted'}`}>
                  <span>{r.title}</span><b>{money(r.price)}</b>
                  {canEdit && <span className="nowrap"><button className="btn btn-sm" onClick={() => setForm(r)}>✎</button><button className="btn btn-sm" onClick={() => remove(r)}>×</button></span>}
                </div>
              ))}
              {canEdit && <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setForm({ user: u.id, title: '', price: '', active: true })}>+ Narx</button>}
            </div>
          )
        })}
      </div>
      {form && (
        <Modal title={form.id ? 'Narxni tahrirlash' : 'Yangi narx'} onClose={() => setForm(null)}>
          <form className="form" onSubmit={save}>
            <div className="form-grid">
              <label className="field full"><span>Ish turi *</span><input className="input" required placeholder="Masalan: Reels montaji" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
              <label className="field"><span>Narxi (1 dona) *</span><input className="input" type="number" step="any" min="0" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
              <label className="field"><span>&nbsp;</span><label className="inline"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Faol</label></label>
            </div>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setForm(null)}>Bekor qilish</button>
              <button className="btn btn-primary">Saqlash</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
