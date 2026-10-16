import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import Layout from './components/Layout'
import ContentPage from './pages/Content'
import Dashboard from './pages/Dashboard'
import FinanceReport from './pages/FinanceReport'
import Login from './pages/Login'
import ProjectDetail from './pages/ProjectDetail'
import {
  AdSpendsPage, ClientsPage, ContractsPage, ExpensesPage, InvoicesPage, LeadsPage, PaymentsPage,
  ProjectsPage, TimeEntriesPage, UsersPage,
} from './pages/simple'
import TasksPage from './pages/Tasks'
import AttendancePage from './pages/Attendance'
import NotesPage from './pages/Notes'
import PayrollPage from './pages/Payroll'
import ProfilePage from './pages/Profile'
import SettingsPage from './pages/Settings'

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
            <Route path="clients" element={<ClientsPage />} />
            <Route path="contracts" element={<ContractsPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:id" element={<ProjectDetail />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="time" element={<TimeEntriesPage />} />
            <Route path="content" element={<ContentPage />} />
            <Route path="invoices" element={<FinanceOnly><InvoicesPage /></FinanceOnly>} />
            <Route path="payments" element={<FinanceOnly><PaymentsPage /></FinanceOnly>} />
            <Route path="expenses" element={<FinanceOnly><ExpensesPage /></FinanceOnly>} />
            <Route path="ad-spends" element={<FinanceOnly><AdSpendsPage /></FinanceOnly>} />
            <Route path="reports/finance" element={<FinanceOnly><FinanceReport /></FinanceOnly>} />
            <Route path="users" element={<UsersPage />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="notes" element={<NotesPage />} />
            <Route path="payroll" element={<FinanceOnly><PayrollPage /></FinanceOnly>} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
