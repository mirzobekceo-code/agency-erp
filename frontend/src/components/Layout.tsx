import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth'

interface Item { to: string; label: string; finance?: boolean; admin?: boolean }

const groups: { title: string; items: Item[] }[] = [
  { title: '', items: [{ to: '/', label: 'Bosh sahifa' }] },
  {
    title: 'Mijozlar',
    items: [
      { to: '/leads', label: 'Lidlar' },
      { to: '/clients', label: 'Mijozlar' },
      { to: '/contracts', label: 'Shartnomalar' },
    ],
  },
  {
    title: 'Ish jarayoni',
    items: [
      { to: '/projects', label: 'Loyihalar' },
      { to: '/tasks', label: 'Vazifalar' },
      { to: '/time', label: 'Ish vaqti' },
      { to: '/content', label: 'Kontent-reja' },
    ],
  },
  {
    title: 'Moliya',
    items: [
      { to: '/invoices', label: 'Hisob-fakturalar', finance: true },
      { to: '/payments', label: "To'lovlar", finance: true },
      { to: '/expenses', label: 'Xarajatlar', finance: true },
      { to: '/ad-spends', label: 'Reklama sarflari', finance: true },
      { to: '/reports/finance', label: 'Moliyaviy hisobot', finance: true },
    ],
  },
  { title: 'Sozlamalar', items: [{ to: '/users', label: 'Xodimlar' }] },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">Agentlik ERP</div>
        <nav onClick={() => setOpen(false)}>
          {groups.map((g) => {
            const items = g.items.filter((i) => !i.finance || user?.can_see_finance)
            if (!items.length) return null
            return (
              <div key={g.title} className="nav-group">
                {g.title && <div className="nav-title">{g.title}</div>}
                {items.map((i) => (
                  <NavLink key={i.to} to={i.to} end={i.to === '/'} className="nav-link">{i.label}</NavLink>
                ))}
              </div>
            )
          })}
        </nav>
        <div className="me">
          <div>
            <div className="me-name">{user?.full_name}</div>
            <div className="me-role">{user?.role_display}</div>
          </div>
          <button className="btn-link" onClick={logout}>Chiqish</button>
        </div>
      </aside>
      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} />}
      <main className="main">
        <button className="menu-btn" onClick={() => setOpen(true)} aria-label="Menyu">☰</button>
        <Outlet />
      </main>
    </div>
  )
}
