import { useCallback, useEffect, useState } from 'react'
import { api, errorText, type Paginated, type Row } from '../api'
import { useAuth } from '../auth'
import { RecordForm, type Field } from '../components/CrudPage'
import { PageHead, Stat, invalidateRefs, refLabel, useRefOptions } from '../components/ui'
import { L, money, relDay } from '../labels'
import { LeadsPage } from './simple'

const COLUMNS = ['new', 'contacted', 'proposal', 'negotiation', 'won'] as const
const STAGE = L.leadStage as Record<string, string>
const SOURCE = L.leadSource as Record<string, string>

export const leadFields: Field[] = [
  { name: 'name', label: 'Kompaniya / ism', required: true },
  { name: 'phone', label: 'Telefon' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'service', label: 'Qiziqqan xizmat' },
  { name: 'expected_value', label: 'Kutilayotgan summa (oyiga)', type: 'money', default: 0 },
  { name: 'source', label: 'Manba', type: 'select', options: L.leadSource, required: true, default: 'instagram' },
  { name: 'stage', label: 'Bosqich', type: 'select', options: L.leadStage, required: true, default: 'new' },
  { name: 'assigned_to', label: "Mas'ul", type: 'ref', ref: '/users/' },
  { name: 'next_action', label: 'Keyingi qadam', full: true },
  { name: 'next_action_date', label: 'Keyingi qadam sanasi', type: 'date' },
  { name: 'notes', label: 'Izoh', type: 'textarea' },
]

const initials = (name?: string | null) => (name ? name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() : '—')

export default function CrmPage() {
  const { can } = useAuth()
  const edit = can('manager', 'sales')
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [leads, setLeads] = useState<Row[]>([])
  const [stats, setStats] = useState<Row | null>(null)
  const [source, setSource] = useState('')
  const [assignee, setAssignee] = useState('')
  const [editing, setEditing] = useState<Row | null>(null)
  const [dragId, setDragId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const users = useRefOptions('/users/')

  const load = useCallback(async () => {
    const params: Row = {}
    if (source) params.source = source
    if (assignee) params.assigned_to = assignee
    try {
      const [a, b] = await Promise.all([
        api.get<Paginated<Row>>('/leads/', { params: { ...params, page_size: 1000 } }),
        api.get('/leads/stats/', { params }),
      ])
      setLeads(a.data.results); setStats(b.data); setError('')
    } catch (e) { setError(errorText(e)) }
  }, [source, assignee])
  useEffect(() => { if (view === 'kanban') load() }, [load, view])

  const move = async (id: number, stage: string) => {
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, stage } : l)))
    try { await api.patch(`/leads/${id}/`, { stage }); load() } catch (e) { setError(errorText(e)); load() }
  }

  const convert = async (lead: Row) => {
    if (!confirm(`"${lead.name}" mijozlar ro'yxatiga qo'shilsinmi?`)) return
    try { await api.post(`/leads/${lead.id}/convert/`); invalidateRefs('/clients/'); setEditing(null); load() } catch (e) { alert(errorText(e)) }
  }

  const lost = leads.filter((l) => l.stage === 'lost')

  return (
    <>
      <PageHead title="CRM">
        <div className="seg">
          <button className={view === 'kanban' ? 'on' : ''} onClick={() => setView('kanban')}>Voronka</button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>Ro'yxat</button>
        </div>
        {edit && view === 'kanban' && <button className="btn btn-primary" onClick={() => setEditing({ stage: 'new' })}>+ So'rov</button>}
      </PageHead>

      {view === 'list' ? <div className="embedded"><LeadsPage /></div> : (
        <>
          {stats && (
            <>
              <p className="page-sub">{stats.active} ta faol mijoz so'rovi{stats.follow_up ? ` · ${stats.follow_up} tasiga bugun qayta aloqa kerak` : ''}</p>
              <div className="stats">
                <Stat label="Voronkadagi summa" value={money(stats.pipeline_sum)} hint="oylik potensial daromad" />
                <Stat label="Konversiya" value={`${stats.conversion}%`} hint="so'rovdan shartnomagacha" />
                <Stat label="Bu oy yangi" value={stats.new_this_month} hint="ta so'rov kelib tushdi" />
                <Stat label="Yutilgan / yo'qotilgan" value={`${stats.won} / ${stats.lost}`} />
              </div>
            </>
          )}

          <div className="toolbar">
            <select className="input" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Manba: barchasi</option>
              {Object.entries(SOURCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Mas'ul: barchasi</option>
              {users.map((u) => <option key={u.id} value={u.id}>{refLabel(u)}</option>)}
            </select>
          </div>
          {error && <div className="alert">{error}</div>}

          <div className="kanban crm-kanban" style={{ gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(190px, 1fr))` }}>
            {COLUMNS.map((s) => {
              const col = leads.filter((l) => l.stage === s)
              const sum = col.reduce((a, l) => a + Number(l.expected_value), 0)
              return (
                <div key={s} className={`kanban-col crm-col crm-${s}`} onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (dragId && edit) move(dragId, s); setDragId(null) }}>
                  <div className="kanban-head">
                    <span>{s === 'won' ? 'Shartnoma' : STAGE[s]} <span className="muted">{col.length}</span></span>
                    <span className="small muted">{money(sum).replace(" so'm", '')}</span>
                  </div>
                  {col.map((l) => {
                    const rd = l.next_action_date ? relDay(l.next_action_date) : null
                    return (
                      <div key={l.id} className="kanban-card" draggable={edit} onDragStart={() => setDragId(l.id)} onClick={() => setEditing(l)}>
                        <div className="kanban-title">{l.name}</div>
                        <div className="muted small">{l.service || '—'}</div>
                        <div className="kanban-meta">
                          <b className="small">{money(l.expected_value)}</b>
                          <span className="src-chip">{SOURCE[l.source]}</span>
                        </div>
                        <div className="kanban-foot">
                          <span className="who small"><i>{initials(l.assigned_to_name)}</i></span>
                          {rd && <span className={`small ${rd.tone}`} title={l.next_action}>{l.next_action ? `${l.next_action} · ` : ''}{rd.text}</span>}
                          {l.client && <span className="small text-good">mijoz ✓</span>}
                        </div>
                      </div>
                    )
                  })}
                  {edit && <button className="add-card" onClick={() => setEditing({ stage: s })}>+ So'rov qo'shish</button>}
                </div>
              )
            })}
          </div>
          {lost.length > 0 && (
            <p className="hint">Rad etilgan so'rovlar: {lost.map((l, i) => (
              <span key={l.id}>{i ? ', ' : ''}<button className="btn-link on-bg-link" onClick={() => setEditing(l)}>{l.name}</button></span>
            ))}</p>
          )}
        </>
      )}

      {editing && (
        <>
          <RecordForm title={editing.id ? `So'rov: ${editing.name}` : "Yangi so'rov"} endpoint="/leads/" fields={leadFields}
            initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
          {edit && editing.id && !editing.client && editing.stage !== 'lost' && (
            <div className="advance-bar">
              <span className="small">Shartnoma tuzildimi?</span>
              <button className="btn btn-primary" onClick={() => convert(editing)}>Mijozga aylantirish →</button>
            </div>
          )}
        </>
      )}
    </>
  )
}
