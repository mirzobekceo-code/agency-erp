import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, errorText, type Paginated, type Row } from '../api'
import { useAuth } from '../auth'
import { RecordForm, type Field } from '../components/CrudPage'
import RevenueChart from '../components/RevenueChart'
import { Modal, PageHead, Stat, useRefOptions } from '../components/ui'
import { L, fmtDate, money, todayISO } from '../labels'

/** Turkum rangi doim bir xil (tasdiqlangan kategorial palitra, tartib bo'yicha). */
const CAT_COLOR: Record<string, string> = {
  salary: '#2a78d6', ads: '#eb6834', freelancer: '#1baf7a', software: '#eda100',
  office: '#e87ba4', equipment: '#008300', tax: '#6250d6', other: '#e34948',
}
const CAT_ORDER = Object.keys(CAT_COLOR)
const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr']

const expenseFields: Field[] = [
  { name: 'category', label: 'Turkum', type: 'select', options: L.expenseCategory, required: true, default: 'other' },
  { name: 'amount', label: 'Summa', type: 'money', required: true },
  { name: 'date', label: 'Sana', type: 'date', required: true, default: todayISO() },
  { name: 'project', label: 'Loyiha (ixtiyoriy)', type: 'ref', ref: '/projects/' },
  { name: 'employee', label: 'Xodim (maosh / frilanser uchun)', type: 'ref', ref: '/users/' },
  { name: 'description', label: 'Tavsif', full: true },
]

export default function FinanceOverview() {
  const { can } = useAuth()
  const edit = can('accountant')
  const [month, setMonth] = useState(todayISO().slice(0, 7))
  const [d, setD] = useState<Row | null>(null)
  const [error, setError] = useState('')
  const [receiving, setReceiving] = useState<Row | null>(null)
  const [spending, setSpending] = useState(false)

  const load = useCallback(() => {
    api.get('/reports/finance-overview/', { params: { month } })
      .then((r) => { setD(r.data); setError('') }).catch((e) => setError(errorText(e)))
  }, [month])
  useEffect(() => { load() }, [load])

  const [y, m] = month.split('-').map(Number)
  const shift = (n: number) => {
    const dt = new Date(y, m - 1 + n, 1)
    setMonth(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`)
  }
  const totalOut = d ? d.expense_breakdown.reduce((s: number, e: Row) => s + Number(e.amount), 0) : 0
  const maxProject = d ? Math.max(1, ...d.revenue_by_project.map((r: Row) => Number(r.amount))) : 1

  return (
    <>
      <PageHead title="Moliya">
        {edit && <button className="btn" onClick={() => setSpending(true)}>− Xarajat qilish</button>}
        {edit && <button className="btn btn-primary" onClick={() => setReceiving({})}>+ To'lov qabul qilish</button>}
      </PageHead>

      <div className="toolbar">
        <div className="month-nav">
          <button className="btn" onClick={() => shift(-1)} aria-label="Oldingi oy">←</button>
          <div className="day-title"><strong>{MONTHS[m - 1]} {y}</strong><span>so'mda</span></div>
          <button className="btn" onClick={() => shift(1)} aria-label="Keyingi oy">→</button>
        </div>
        <div className="fin-links">
          <Link to="/invoices">Hisob-fakturalar</Link><Link to="/payments">To'lovlar</Link>
          <Link to="/expenses">Xarajatlar</Link><Link to="/payroll">Oylik vedomost</Link>
          <Link to="/reports/finance">Batafsil hisobot</Link>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}
      {d && (
        <>
          <div className="stats fin-stats">
            <Stat label="Mijozlardan tushdi" value={money(d.revenue)} hint="shu oyda qo'lga tekkan" tone="good" />
            <Stat label="Xodimlarga oylik to'landi" value={money(d.salaries)} hint="shu oyda berilgan" />
            <Stat label="Boshqa xarajatlar" value={money(d.other_expenses)} hint="ofis, reklama, ijara…" />
            <Stat label="Sof foyda" value={money(d.profit)} tone={Number(d.profit) < 0 ? 'bad' : 'good'}
              hint={d.margin != null ? `marja ${d.margin}%` : 'tushum yo\'q'} />
            <Stat label="Mijozlar qarzi" value={money(d.receivables)} hint="to'lanmagan hisob-fakturalar"
              tone={Number(d.receivables) > 0 ? 'warn' : undefined} />
            <Stat label="Oyliklardan qoldiq" value={money(d.payroll_left)}
              hint={<Link to="/payroll">vedomost ({fmtDate(d.payroll_pay_date)}) →</Link>}
              tone={Number(d.payroll_left) > 0 ? 'bad' : undefined} />
          </div>

          <div className="fin-grid">
            <section className="card">
              <h3>Pul oqimi — so'nggi 6 oy</h3>
              <RevenueChart data={d.cash_flow} labels={{ revenue: 'Kirim', expenses: 'Chiqim' }} />
            </section>

            <section className="card">
              <h3>Chiqimlar tarkibi</h3>
              {d.expense_breakdown.length === 0 ? <p className="muted">Bu oyda xarajat yo'q</p> : (
                <>
                  <div className="stack-bar" role="img" aria-label="Chiqimlar tarkibi">
                    {/* Segmentlar palitra tartibida — yonma-yon ranglar shu tartibda tekshirilgan */}
                    {[...d.expense_breakdown].sort((a: Row, b: Row) => CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(b.category)).map((e: Row) => (
                      <span key={e.category} style={{ flexGrow: Number(e.amount), background: CAT_COLOR[e.category] }}
                        title={`${e.label}: ${money(e.amount)} (${Math.round((Number(e.amount) / totalOut) * 100)}%)`} />
                    ))}
                  </div>
                  <ul className="breakdown">
                    {d.expense_breakdown.map((e: Row) => (
                      <li key={e.category}>
                        <i style={{ background: CAT_COLOR[e.category] }} />
                        <span className="bd-label">{e.label}</span>
                        <span className="bd-pct">{Math.round((Number(e.amount) / totalOut) * 100)}%</span>
                        <span className="bd-amount">{money(e.amount)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="bd-total"><span>Jami chiqim</span><b>{money(totalOut)}</b></div>
                </>
              )}
            </section>
          </div>

          <div className="dash-grid">
            <section className="card">
              <h3>Tushum loyihalar bo'yicha</h3>
              {d.revenue_by_project.length === 0 ? <p className="muted">Bu oyda tushum yo'q</p> : (
                <div className="progress-list">
                  {d.revenue_by_project.map((r: Row) => (
                    <div key={r.name} className="progress-row">
                      <span className="progress-name">{r.name}</span>
                      <span className="progress-track"><span style={{ width: `${(Number(r.amount) / maxProject) * 100}%` }} /></span>
                      <span className="progress-amt">{money(r.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="card">
              <div className="card-head"><h3>Kutilayotgan mijoz to'lovlari</h3><Link to="/invoices">Hammasi</Link></div>
              {d.expected_payments.length === 0 ? <p className="muted">To'lanmagan hisob-faktura yo'q</p> : (
                <ul className="list">
                  {d.expected_payments.map((p: Row) => (
                    <li key={p.id}>
                      <div>
                        <div className="task-title">{p.client}</div>
                        <div className="muted small">{p.number}{p.project ? ` · ${p.project}` : ''}</div>
                      </div>
                      <div className="list-meta">
                        <b>{money(p.balance)}</b>
                        <span className={`small ${p.overdue ? 'text-bad' : 'muted'}`}>{fmtDate(p.due_date)}{p.overdue ? ' · kechikdi' : ''}</span>
                        {edit && <button className="btn-link small" onClick={() => setReceiving({ invoice: p.id })}>To'lov qabul qilish</button>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="card">
            <h3>So'nggi operatsiyalar</h3>
            {d.recent.length === 0 ? <p className="muted">Bu oyda operatsiya yo'q</p> : (
              <table className="table compact">
                <tbody>
                  {d.recent.map((r: Row, i: number) => (
                    <tr key={i}>
                      <td className="muted">{fmtDate(r.date)}</td>
                      <td><div>{r.title}</div><div className="muted small">{r.sub}</div></td>
                      <td className={`r ${r.kind === 'in' ? 'text-good' : 'text-bad'}`}>{r.kind === 'in' ? '+' : '−'}{money(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {receiving && <ReceiveModal initial={receiving} onClose={() => setReceiving(null)} onSaved={() => { setReceiving(null); load() }} />}
      {spending && (
        <RecordForm title="Xarajat qilish" endpoint="/expenses/" fields={expenseFields} initial={{}}
          onClose={() => setSpending(false)} onSaved={() => { setSpending(false); load() }} />
      )}
    </>
  )
}

function ReceiveModal({ initial, onClose, onSaved }: { initial: Row; onClose: () => void; onSaved: () => void }) {
  const clients = useRefOptions('/clients/')
  const [client, setClient] = useState<string>('')
  const [invoices, setInvoices] = useState<Row[]>([])
  const [invoice, setInvoice] = useState<string>(initial.invoice ? String(initial.invoice) : '')
  const [project, setProject] = useState('')
  const [projects, setProjects] = useState<Row[]>([])
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [method, setMethod] = useState('transfer')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Hisob-fakturadan ochilgan bo'lsa — mijoz va qoldiqni avtomatik to'ldirish
  useEffect(() => {
    if (!initial.invoice) return
    api.get(`/invoices/${initial.invoice}/`).then((r) => {
      setClient(String(r.data.client)); setAmount(String(Number(r.data.balance)))
    }).catch(() => {})
  }, [initial.invoice])

  useEffect(() => {
    if (!client) { setInvoices([]); setProjects([]); return }
    api.get<Paginated<Row>>('/invoices/', { params: { client, status__in: 'sent,partial', page_size: 200 } })
      .then((r) => setInvoices(r.data.results)).catch(() => {})
    api.get<Paginated<Row>>('/projects/', { params: { client, page_size: 200 } })
      .then((r) => setProjects(r.data.results)).catch(() => {})
  }, [client])

  const pickInvoice = (id: string) => {
    setInvoice(id)
    const inv = invoices.find((i) => String(i.id) === id)
    if (inv) setAmount(String(Number(inv.balance)))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/finance/receive/', {
        invoice: invoice || null, client: invoice ? null : client || null, project: !invoice && project ? project : null,
        amount, date, method, note,
      })
      onSaved()
    } catch (err) { setError(errorText(err)) } finally { setSaving(false) }
  }

  return (
    <Modal title="To'lov qabul qilish" onClose={onClose}>
      <form onSubmit={submit} className="form">
        <div className="form-grid">
          <label className="field full"><span>Mijoz *</span>
            <select className="input" value={client} required onChange={(e) => { setClient(e.target.value); setInvoice(''); setProject('') }}>
              <option value="">— tanlang —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          {client && (
            <label className="field full"><span>Qaysi hisob uchun</span>
              <select className="input" value={invoice} onChange={(e) => pickInvoice(e.target.value)}>
                <option value="">Yangi to'lov (hisob-fakturasiz — avtomatik yaratiladi)</option>
                {invoices.map((i) => <option key={i.id} value={i.id}>{i.number} · qoldiq {money(i.balance)}{i.project_name ? ` · ${i.project_name}` : ''}</option>)}
              </select>
            </label>
          )}
          {client && !invoice && projects.length > 0 && (
            <label className="field full"><span>Loyiha (ixtiyoriy)</span>
              <select className="input" value={project} onChange={(e) => setProject(e.target.value)}>
                <option value="">—</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
          <label className="field"><span>Summa *</span><input className="input" type="number" min={1} step="any" required value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label className="field"><span>Sana</span><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="field"><span>To'lov usuli</span>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              {Object.entries(L.paymentMethod).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="field"><span>Izoh</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
        </div>
        {error && <div className="alert pre">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Bekor qilish</button>
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Saqlanmoqda…' : 'Qabul qilish'}</button>
        </div>
      </form>
    </Modal>
  )
}
