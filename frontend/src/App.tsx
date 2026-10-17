import { lazy, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import Layout from './components/Layout'

// Sahifalar kerak bo'lganda yuklanadi (birinchi ochilish tezroq)
const ContentPage = lazy(() => import('./pages/Content'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const FinanceOverview = lazy(() => import('./pages/FinanceOverview'))
const FinanceReport = lazy(() => import('./pages/FinanceReport'))
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'))
const TasksPage = lazy(() => import('./pages/Tasks'))
const CrmPage = lazy(() => import('./pages/Crm'))
const ReportsPage = lazy(() => import('./pages/Reports'))
const StudioPage = lazy(() => import('./pages/Studio'))
const AttendancePage = lazy(() => import('./pages/Attendance'))
const NotesPage = lazy(() => import('./pages/Notes'))
const PayrollPage = lazy(() => import('./pages/Payroll'))
const ProfilePage = lazy(() => import('./pages/Profile'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const AdSpendsPage = lazy(() => import('./pages/simple').then((m) => ({ default: m.AdSpendsPage })))
const ClientsPage = lazy(() => import('./pages/simple').then((m) => ({ default: m.ClientsPage })))
const ContractsPage = lazy(() => import('./pages/simple').then((m) => ({ default: m.ContractsPage })))
const ExpensesPage = lazy(() => import('./pages/simple').then((m) => ({ default: m.ExpensesPage })))
const InvoicesPage = lazy(() => import('./pages/simple').then((m) => ({ default: m.InvoicesPage })))
const LeadsPage = lazy(() => import('./pages/simple').then((m) => ({ default: m.LeadsPage })))
const PaymentsPage = lazy(() => import('./pages/simple').then((m) => ({ default: m.PaymentsPage })))
const ProjectsPage = lazy(() => import('./pages/simple').then((m) => ({ default: m.ProjectsPage })))
const TimeEntriesPage = lazy(() => import('./pages/simple').then((m) => ({ default: m.TimeEntriesPage })))
const UsersPage = lazy(() => import('./pages/simple').then((m) => ({ default: m.UsersPage })))
import Login from './pages/Login'

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="center muted">Yuklanmoqda…</div>
  return user ? children : <Navigate to="/login" replace />
}

function FinanceOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return user?.can_see_finance ? children : <div className="alert">Bu bo'limga kirish huquqingiz yo'q.</div>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protected><Layout /></Protected>}>
            <Route index element={<Dashboard />} />
            <Route path="leads" element={<LeadsPage />} />
            <Route path="crm" element={<CrmPage />} />
            <Route path="studio" element={<StudioPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="contracts" element={<ContractsPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:id" element={<ProjectDetail />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="time" element={<TimeEntriesPage />} />
            <Route path="content" element={<ContentPage />} />
            <Route path="finance" element={<FinanceOnly><FinanceOverview /></FinanceOnly>} />
            <Route path="invoices" element={<FinanceOnly><InvoicesPage /></FinanceOnly>} />
            <Route path="payments" element={<FinanceOnly><PaymentsPage /></FinanceOnly>} />
            <Route path="expenses" element={<FinanceOnly><ExpensesPage /></FinanceOnly>} />
            <Route path="ad-spends" element={<FinanceOnly><AdSpendsPage /></FinanceOnly>} />
            <Route path="reports/finance" element={<FinanceOnly><FinanceReport /></FinanceOnly>} />
            <Route path="users" element={<UsersPage />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="notes" element={<NotesPage />} />
            <Route path="payroll" element={<PayrollPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
