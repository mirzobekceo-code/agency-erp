import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { api, type Paginated, type Row } from '../api'
import { useAuth } from '../auth'

interface Item { to: string; label: string; finance?: boolean; payroll?: boolean }

// title link berilsa, guruh sarlavhasi bosilganda o'sha sahifa ochiladi

const groups: { title: string; link?: string; items: Item[] }[] = [
  {
    title: 'Ish',
    items: [
      { to: '/', label: 'Bosh sahifa' },
      { to: '/tasks', label: 'Vazifalar' },
      { to: '/studio', label: 'Kontent studio' },
      { to: '/content', label: 'Kalendar' },
      { to: '/time', label: 'Ish vaqti' },
    ],
  },
  {
    title: 'Mijozlar',
    items: [
      { to: '/projects', label: 'Loyihalar' },
      { to: '/crm', label: 'CRM' },
      { to: '/clients', label: 'Mijozlar' },
      { to: '/contracts', label: 'Shartnomalar' },
      { to: '/reports', label: 'Hisobot' },
    ],
  },
  {
    title: 'Agentlik',
    items: [
      { to: '/users', label: 'Jamoa' },
      { to: '/attendance', label: 'Davomat' },
      { to: '/notes', label: 'Yozuvlar' },
    ],
  },
  {
    title: 'Moliya',
    link: '/finance',
    items: [
      { to: '/finance', label: 'Umumiy holat', finance: true },
      { to: '/invoices', label: 'Hisob-fakturalar', finance: true },
      { to: '/payments', label: "To'lovlar", finance: true },
      { to: '/expenses', label: 'Xarajatlar', finance: true },
      { to: '/payroll', label: 'Oylik vedomost', payroll: true },
      { to: '/ad-spends', label: 'Reklama sarflari', finance: true },
      { to: '/reports/finance', label: 'Moliyaviy hisobot', finance: true },
    ],
  },
]

export default function Layout() {
  const { user, logout, can } = useAuth()
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<Row[]>([])
  const loc = useLocation()

  useEffect(() => {
    api.get<Paginated<Row>>('/projects/', { params: { status: 'active', page_size: 6, ordering: 'deadline' } })
      .then((r) => setProjects(r.data.results)).catch(() => {})
  }, [loc.pathname])

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">Agentlik ERP</div>
        <nav onClick={() => setOpen(false)}>
          {groups.map((g) => {
            const canPayroll = can('accountant', 'hr')
            const items = g.items.filter((i) => (i.payroll ? canPayroll : !i.finance || user?.can_see_finance))
            if (!items.length) return null
            return (
              <div key={g.title} className="nav-group">
                {g.link ? <NavLink to={g.link} className="nav-title nav-title-link">{g.title}</NavLink>
                  : <div className="nav-title">{g.title}</div>}
                {items.map((i) => (
                  <NavLink key={i.to} to={i.to} end={i.to === '/'} className="nav-link">{i.label}</NavLink>
                ))}
              </div>
            )
          })}
          {projects.length > 0 && (
            <div className="nav-group">
              <div className="nav-title nav-title-row">Faol loyihalar <NavLink to="/projects">Barchasi</NavLink></div>
              {projects.map((p) => {
                const pct = p.tasks_total ? Math.round((p.tasks_done / p.tasks_total) * 100) : 0
                return (
                  <NavLink key={p.id} to={`/projects/${p.id}`} className="nav-link nav-project">
                    <span className="nav-project-name">{p.name}</span><span className="nav-pct">{pct}%</span>
                  </NavLink>
                )
              })}
            </div>
          )}
          <div className="nav-group">
            <div className="nav-title">Shaxsiy</div>
            <NavLink to="/profile" className="nav-link">Profil</NavLink>
            {can() && <NavLink to="/settings" className="nav-link">Sozlamalar</NavLink>}
          </div>
        </nav>
        <div className="me">
          <NavLink to="/profile" className="me-link" onClick={() => setOpen(false)}>
            <div className="me-name">{user?.full_name}</div>
            <div className="me-role">{user?.position || user?.role_display}</div>
          </NavLink>
          <button className="btn-link" onClick={logout}>Chiqish</button>
        </div>
      </aside>
      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} />}
      <main className="main">
        <button className="menu-btn" onClick={() => setOpen(true)} aria-label="Menyu">☰</button>
        <Suspense fallback={<div className="muted on-bg">Yuklanmoqda…</div>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
