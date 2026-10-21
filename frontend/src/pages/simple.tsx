import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errorText, type Row } from '../api'
import { useAuth } from '../auth'
import CrudPage, { RecordForm, type Field } from '../components/CrudPage'
import { Badge, invalidateRefs } from '../components/ui'
import { L, fmtDate, money, num, relDay, todayISO } from '../labels'

const badge = (map: Record<string, string>, key: string) => (r: Row) => <Badge value={r[key]} label={map[r[key]]} />

export function ClientsPage() {
  const { can } = useAuth()
  return (
    <CrudPage
      title="Mijozlar" endpoint="/clients/" canEdit={can('manager', 'sales')}
      filters={[{ name: 'status', label: 'Holat', options: L.clientStatus }, { name: 'manager', label: 'Menejer', ref: '/users/' }]}
      columns={[
        { key: 'name', label: 'Kompaniya' },
        { key: 'industry', label: 'Soha' },
        { key: 'contact_person', label: "Mas'ul shaxs" },
        { key: 'phone', label: 'Telefon' },
        { key: 'manager_name', label: 'Menejer' },
        { key: 'projects_count', label: 'Loyihalar', align: 'right' },
        { key: 'status', label: 'Holat', render: badge(L.clientStatus, 'status') },
      ]}
      fields={[
        { name: 'name', label: 'Kompaniya nomi', required: true },
        { name: 'industry', label: 'Soha' },
        { name: 'contact_person', label: "Mas'ul shaxs" },
        { name: 'phone', label: 'Telefon' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'telegram', label: 'Telegram' },
        { name: 'inn', label: 'STIR (INN)' },
        { name: 'address', label: 'Manzil' },
        { name: 'status', label: 'Holat', type: 'select', options: L.clientStatus, required: true, default: 'active' },
        { name: 'manager', label: 'Menejer', type: 'ref', ref: '/users/' },
        { name: 'notes', label: 'Izoh', type: 'textarea' },
      ]}
    />
  )
}

export function LeadsPage() {
  const { can } = useAuth()
  const convert = async (row: Row, reload: () => void) => {
    if (!confirm(`"${row.name}" mijozlar ro'yxatiga qo'shilsinmi?`)) return
    try {
      await api.post(`/leads/${row.id}/convert/`)
      invalidateRefs('/clients/')
      reload()
    } catch (e) { alert(errorText(e)) }
  }
  return (
    <CrudPage
      title="Lidlar" endpoint="/leads/" canEdit={can('manager', 'sales')}
      filters={[{ name: 'stage', label: 'Bosqich', options: L.leadStage }, { name: 'source', label: 'Manba', options: L.leadSource }]}
      columns={[
        { key: 'name', label: 'Ism / kompaniya' },
        { key: 'phone', label: 'Telefon' },
        { key: 'service', label: 'Xizmat' },
        { key: 'source', label: 'Manba', render: (r) => L.leadSource[r.source as keyof typeof L.leadSource] },
        { key: 'expected_value', label: 'Kutilayotgan summa', align: 'right', render: (r) => money(r.expected_value) },
        { key: 'assigned_to_name', label: "Mas'ul" },
        {
          key: 'next_action', label: 'Keyingi qadam', render: (r) => r.next_action_date
            ? <span className={relDay(r.next_action_date).tone}>{r.next_action || 'Aloqa'} · {relDay(r.next_action_date).text}</span>
            : (r.next_action || '—'),
        },
        { key: 'stage', label: 'Bosqich', render: badge(L.leadStage, 'stage') },
      ]}
      rowActions={(row, reload) =>
        can('manager') && !row.client && row.stage !== 'lost' ? (
          <button className="btn-link" onClick={() => convert(row, reload)}>Mijozga aylantirish</button>
        ) : null
      }
      fields={[
        { name: 'name', label: 'Ism / kompaniya', required: true },
        { name: 'phone', label: 'Telefon' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'source', label: 'Manba', type: 'select', options: L.leadSource, required: true, default: 'instagram' },
        { name: 'stage', label: 'Bosqich', type: 'select', options: L.leadStage, required: true, default: 'new' },
        { name: 'service', label: 'Qiziqqan xizmat' },
        { name: 'expected_value', label: 'Kutilayotgan summa', type: 'money', default: 0 },
        { name: 'assigned_to', label: "Mas'ul", type: 'ref', ref: '/users/' },
        { name: 'next_action', label: 'Keyingi qadam', full: true },
        { name: 'next_action_date', label: 'Keyingi qadam sanasi', type: 'date' },
        { name: 'notes', label: 'Izoh', type: 'textarea' },
      ]}
    />
  )
}

export function ContractsPage() {
  const { can } = useAuth()
  return (
    <CrudPage
      title="Shartnomalar" endpoint="/contracts/" canEdit={can('manager', 'sales')}
      filters={[{ name: 'status', label: 'Holat', options: L.contractStatus }, { name: 'client', label: 'Mijoz', ref: '/clients/' }]}
      columns={[
        { key: 'number', label: 'Raqam' },
        { key: 'client_name', label: 'Mijoz' },
        { key: 'title', label: 'Predmet' },
        { key: 'start_date', label: 'Boshlanish', render: (r) => fmtDate(r.start_date) },
        { key: 'end_date', label: 'Tugash', render: (r) => fmtDate(r.end_date) },
        { key: 'monthly_fee', label: "Oylik to'lov", align: 'right', render: (r) => money(r.monthly_fee) },
        { key: 'file', label: 'Fayl', render: (r) => (r.file ? <a href={r.file} target="_blank" onClick={(e) => e.stopPropagation()}>Ochish</a> : '—') },
        { key: 'status', label: 'Holat', render: badge(L.contractStatus, 'status') },
      ]}
      fields={[
        { name: 'client', label: 'Mijoz', type: 'ref', ref: '/clients/', required: true },
        { name: 'number', label: 'Shartnoma raqami', required: true },
        { name: 'title', label: 'Predmet' },
        { name: 'status', label: 'Holat', type: 'select', options: L.contractStatus, required: true, default: 'active' },
        { name: 'start_date', label: 'Boshlanish sanasi', type: 'date', required: true, default: todayISO() },
        { name: 'end_date', label: 'Tugash sanasi', type: 'date' },
        { name: 'monthly_fee', label: "Oylik to'lov", type: 'money', default: 0 },
        { name: 'total_amount', label: 'Umumiy summa', type: 'money', default: 0 },
        { name: 'file', label: 'Shartnoma fayli', type: 'file', full: true },
      ]}
    />
  )
}

export function ProjectsPage() {
  const { can } = useAuth()
  const nav = useNavigate()
  const [editing, setEditing] = useState<Row | null>(null)
  const [version, setVersion] = useState(0)
  return (
    <>
      <CrudPage
        key={version}
        title="Loyihalar" endpoint="/projects/" canEdit={can('manager', 'sales')} canCreate={false}
        headerExtra={can('manager') && <button className="btn btn-primary" onClick={() => setEditing({})}>+ Qo'shish</button>}
        onRowClick={(r) => nav(`/projects/${r.id}`)}
        filters={[
          { name: 'status', label: 'Holat', options: L.projectStatus },
          { name: 'service', label: 'Xizmat', options: L.service },
          { name: 'client', label: 'Mijoz', ref: '/clients/' },
        ]}
        columns={[
          { key: 'name', label: 'Loyiha' },
          { key: 'client_name', label: 'Mijoz' },
          { key: 'service', label: 'Xizmat', render: (r) => r.service_display },
          { key: 'manager_name', label: 'Menejer' },
          { key: 'deadline', label: 'Muddat', render: (r) => fmtDate(r.deadline) },
          {
            key: 'progress', label: 'Vazifalar', render: (r) => (
              <div className="progress" title={`${r.tasks_done} / ${r.tasks_total}`}>
                <div style={{ width: `${r.tasks_total ? (r.tasks_done / r.tasks_total) * 100 : 0}%` }} />
                <span>{r.tasks_done}/{r.tasks_total}</span>
              </div>
            ),
          },
          { key: 'status', label: 'Holat', render: badge(L.projectStatus, 'status') },
        ]}
        fields={projectFields}
      />
      {editing && (
        <RecordForm title="Yangi loyiha" endpoint="/projects/" fields={projectFields} initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(r) => { setEditing(null); invalidateRefs('/projects/'); setVersion((v) => v + 1); nav(`/projects/${r.id}`) }} />
      )}
    </>
  )
}

export const projectFields: Field[] = [
  { name: 'name', label: 'Loyiha nomi', required: true },
  { name: 'client', label: 'Mijoz', type: 'ref', ref: '/clients/', required: true },
  { name: 'service', label: 'Xizmat turi', type: 'select', options: L.service, required: true, default: 'smm' },
  { name: 'status', label: 'Holat', type: 'select', options: L.projectStatus, required: true, default: 'planning' },
  { name: 'start_date', label: 'Boshlanish', type: 'date' },
  { name: 'deadline', label: 'Muddat', type: 'date' },
  { name: 'budget', label: 'Loyiha qiymati', type: 'money', default: 0 },
  { name: 'ad_budget', label: 'Reklama byudjeti', type: 'money', default: 0 },
  { name: 'manager', label: 'Menejer', type: 'ref', ref: '/users/' },
  { name: 'members', label: 'Jamoa', type: 'multiref', ref: '/users/' },
  { name: 'description', label: 'Tavsif', type: 'textarea' },
]

export function TimeEntriesPage() {
  return (
    <CrudPage
      title="Ish vaqti" endpoint="/time-entries/"
      filters={[{ name: 'user', label: 'Xodim', ref: '/users/' }, { name: 'task__project', label: 'Loyiha', ref: '/projects/' }]}
      columns={[
        { key: 'date', label: 'Sana', render: (r) => fmtDate(r.date) },
        { key: 'user_name', label: 'Xodim' },
        { key: 'task_title', label: 'Vazifa' },
        { key: 'hours', label: 'Soat', align: 'right', render: (r) => num(r.hours) },
        { key: 'note', label: 'Izoh' },
      ]}
      fields={[
        { name: 'task', label: 'Vazifa', type: 'ref', ref: '/tasks/', required: true, full: true },
        { name: 'date', label: 'Sana', type: 'date', required: true, default: todayISO() },
        { name: 'hours', label: 'Soat', type: 'number', required: true },
        { name: 'note', label: 'Izoh', full: true },
      ]}
    />
  )
}

const invoiceFields: Field[] = [
  { name: 'client', label: 'Mijoz', type: 'ref', ref: '/clients/', required: true },
  { name: 'project', label: 'Loyiha', type: 'ref', ref: '/projects/' },
  { name: 'number', label: "Raqam (bo'sh qolsa avtomatik)" },
  { name: 'amount', label: 'Summa', type: 'money', required: true },
  { name: 'issue_date', label: 'Sana', type: 'date', required: true, default: todayISO() },
  { name: 'due_date', label: "To'lov muddati", type: 'date' },
  { name: 'status', label: 'Holat', type: 'select', options: { draft: 'Qoralama', sent: 'Yuborilgan', cancelled: 'Bekor qilingan' }, required: true, default: 'sent' },
  { name: 'notes', label: 'Izoh', type: 'textarea' },
]

const paymentFields: Field[] = [
  { name: 'invoice', label: 'Hisob-faktura', type: 'ref', ref: '/invoices/', required: true },
  { name: 'amount', label: 'Summa', type: 'money', required: true },
  { name: 'date', label: 'Sana', type: 'date', required: true, default: todayISO() },
  { name: 'method', label: "To'lov usuli", type: 'select', options: L.paymentMethod, required: true, default: 'transfer' },
  { name: 'note', label: 'Izoh', full: true },
]

export function InvoicesPage() {
  const { can } = useAuth()
  const [paying, setPaying] = useState<{ row: Row; reload: () => void } | null>(null)
  const edit = can('accountant')
  return (
    <>
      <CrudPage
        title="Hisob-fakturalar" endpoint="/invoices/" canEdit={edit}
        filters={[{ name: 'status', label: 'Holat', options: L.invoiceStatus }, { name: 'client', label: 'Mijoz', ref: '/clients/' }]}
        columns={[
          { key: 'number', label: 'Raqam' },
          { key: 'client_name', label: 'Mijoz' },
          { key: 'project_name', label: 'Loyiha' },
          { key: 'issue_date', label: 'Sana', render: (r) => fmtDate(r.issue_date) },
          { key: 'due_date', label: 'Muddat', render: (r) => <span className={r.is_overdue ? 'text-bad' : ''}>{fmtDate(r.due_date)}{r.is_overdue && ' ⚠ muddati o\'tgan'}</span> },
          { key: 'amount', label: 'Summa', align: 'right', render: (r) => money(r.amount) },
          { key: 'paid_amount', label: "To'langan", align: 'right', render: (r) => money(r.paid_amount) },
          { key: 'balance', label: 'Qoldiq', align: 'right', render: (r) => money(r.balance) },
          { key: 'status', label: 'Holat', render: badge(L.invoiceStatus, 'status') },
        ]}
        rowActions={(row, reload) =>
          edit && Number(row.balance) > 0 && row.status !== 'cancelled' ? (
            <button className="btn-link" onClick={() => setPaying({ row, reload })}>To'lov qabul qilish</button>
          ) : null
        }
        fields={invoiceFields}
      />
      {paying && (
        <RecordForm title={`To'lov: ${paying.row.number}`} endpoint="/payments/" fields={paymentFields}
          initial={{ invoice: paying.row.id, amount: paying.row.balance }}
          onClose={() => setPaying(null)}
          onSaved={() => { paying.reload(); setPaying(null) }} />
      )}
    </>
  )
}

export function PaymentsPage() {
  const { can } = useAuth()
  return (
    <CrudPage
      title="To'lovlar" endpoint="/payments/" canEdit={can('accountant')}
      filters={[{ name: 'method', label: 'Usul', options: L.paymentMethod }, { name: 'invoice__client', label: 'Mijoz', ref: '/clients/' }]}
      columns={[
        { key: 'date', label: 'Sana', render: (r) => fmtDate(r.date) },
        { key: 'client_name', label: 'Mijoz' },
        { key: 'invoice_number', label: 'Hisob-faktura' },
        { key: 'method', label: 'Usul', render: (r) => r.method_display },
        { key: 'amount', label: 'Summa', align: 'right', render: (r) => money(r.amount) },
        { key: 'note', label: 'Izoh' },
      ]}
      fields={paymentFields}
    />
  )
}

export function ExpensesPage() {
  const { can } = useAuth()
  return (
    <CrudPage
      title="Xarajatlar" endpoint="/expenses/" canEdit={can('accountant')}
      filters={[{ name: 'category', label: 'Turkum', options: L.expenseCategory }, { name: 'project', label: 'Loyiha', ref: '/projects/' }]}
      columns={[
        { key: 'date', label: 'Sana', render: (r) => fmtDate(r.date) },
        { key: 'category', label: 'Turkum', render: (r) => r.category_display },
        { key: 'description', label: 'Tavsif' },
        { key: 'project_name', label: 'Loyiha' },
        { key: 'employee_name', label: 'Xodim' },
        { key: 'amount', label: 'Summa', align: 'right', render: (r) => money(r.amount) },
      ]}
      fields={[
        { name: 'category', label: 'Turkum', type: 'select', options: L.expenseCategory, required: true, default: 'other' },
        { name: 'amount', label: 'Summa', type: 'money', required: true },
        { name: 'date', label: 'Sana', type: 'date', required: true, default: todayISO() },
        { name: 'project', label: 'Loyiha', type: 'ref', ref: '/projects/' },
        { name: 'employee', label: 'Xodim (maosh uchun)', type: 'ref', ref: '/users/' },
        { name: 'description', label: 'Tavsif', full: true },
      ]}
    />
  )
}

export function AdSpendsPage() {
  const { can } = useAuth()
  return (
    <CrudPage
      title="Reklama sarflari" endpoint="/ad-spends/" canEdit={can('accountant', 'manager')}
      filters={[{ name: 'platform', label: 'Platforma', options: L.adPlatform }, { name: 'project', label: 'Loyiha', ref: '/projects/' }]}
      columns={[
        { key: 'date', label: 'Sana', render: (r) => fmtDate(r.date) },
        { key: 'project_name', label: 'Loyiha' },
        { key: 'platform', label: 'Platforma', render: (r) => r.platform_display },
        { key: 'amount', label: 'Summa', align: 'right', render: (r) => money(r.amount) },
        { key: 'impressions', label: "Ko'rishlar", align: 'right', render: (r) => num(r.impressions) },
        { key: 'clicks', label: 'Bosishlar', align: 'right', render: (r) => num(r.clicks) },
        { key: 'ctr', label: 'CTR', align: 'right', render: (r) => (r.ctr == null ? '—' : `${r.ctr}%`) },
        { key: 'leads', label: 'Lidlar', align: 'right', render: (r) => num(r.leads) },
        { key: 'cpl', label: 'Lid narxi', align: 'right', render: (r) => money(r.cpl) },
      ]}
      fields={[
        { name: 'project', label: 'Loyiha', type: 'ref', ref: '/projects/', required: true },
        { name: 'platform', label: 'Platforma', type: 'select', options: L.adPlatform, required: true, default: 'meta' },
        { name: 'date', label: 'Sana', type: 'date', required: true, default: todayISO() },
        { name: 'amount', label: 'Summa', type: 'money', required: true },
        { name: 'impressions', label: "Ko'rishlar", type: 'number', default: 0 },
        { name: 'clicks', label: 'Bosishlar', type: 'number', default: 0 },
        { name: 'leads', label: 'Lidlar', type: 'number', default: 0 },
        { name: 'note', label: 'Izoh' },
      ]}
    />
  )
}

export function UsersPage() {
  const { can } = useAuth()
  const admin = can('hr')
  return (
    <CrudPage
      title="Jamoa" endpoint="/users/" canEdit={admin}
      filters={[{ name: 'job', label: 'Lavozim', options: L.job }, { name: 'role', label: 'Huquq', options: L.role }]}
      columns={[
        { key: 'full_name', label: 'F.I.Sh.' },
        { key: 'username', label: 'Login' },
        { key: 'job', label: 'Lavozim', render: (r) => r.position || r.job_display },
        { key: 'role', label: 'Kirish huquqi', render: (r) => r.role_display },
        { key: 'phone', label: 'Telefon' },
        ...(can('accountant') ? [{ key: 'salary', label: 'Maosh', align: 'right' as const, render: (r: Row) => money(r.salary) }] : []),
        { key: 'is_active', label: 'Holat', render: (r) => <Badge value={r.is_active ? 'active' : 'archived'} label={r.is_active ? 'Faol' : 'Nofaol'} /> },
      ]}
      fields={[
        { name: 'username', label: 'Login', required: true },
        { name: 'password', label: "Parol (o'zgartirish uchun)", type: 'password' },
        { name: 'first_name', label: 'Ism', required: true },
        { name: 'last_name', label: 'Familiya' },
        { name: 'job', label: 'Lavozim', type: 'select', options: L.job, required: true, default: 'smm' },
        { name: 'role', label: "Kirish huquqi (bo'sh qolsa — lavozimdan)", type: 'select', options: L.role },
        { name: 'position', label: "Lavozim nomi (ixtiyoriy, masalan 'Katta dizayner')" },
        { name: 'phone', label: 'Telefon' },
        { name: 'telegram', label: 'Telegram @username (vazifa xabarida belgilanadi)' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'salary', label: 'Oylik maosh', type: 'money', default: 0 },
        { name: 'hired_at', label: 'Ishga kirgan sana', type: 'date' },
        { name: 'work_format', label: 'Ish formati', type: 'select', required: true, default: 'office',
          options: { office: 'Ofisda', remote: 'Masofadan', hybrid: 'Aralash' } },
        { name: 'employee_type', label: 'Xodim turi', type: 'select', required: true, default: 'permanent',
          options: { permanent: 'Doimiy xodim', trial: 'Sinov muddatida', intern: 'Shogird / amaliyotchi', freelance: 'Frilanser' } },
        { name: 'track_attendance', label: 'Davomatda hisobga olinadi', type: 'checkbox', default: true },
        { name: 'is_active', label: 'Faol', type: 'checkbox', default: true },
      ]}
    />
  )
}
