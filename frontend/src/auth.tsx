import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, tokens } from './api'

export interface Me {
  id: number
  username: string
  full_name: string
  role: 'admin' | 'manager' | 'specialist' | 'accountant'
  role_display: string
  is_superuser: boolean
  can_see_finance: boolean
}

interface AuthCtx {
  user: Me | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  /** Admin yoki ro'yxatdagi rollardan biri. */
  can: (...roles: Me['role'][]) => boolean
}

const Ctx = createContext<AuthCtx>(null!)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  const loadMe = useCallback(async () => {
    if (!tokens.access) { setLoading(false); return }
    try {
      setUser((await api.get<Me>('/auth/me/')).data)
    } catch {
      tokens.clear()
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadMe() }, [loadMe])

  const login = async (username: string, password: string) => {
    const r = await api.post('/auth/login/', { username, password })
    tokens.set(r.data.access, r.data.refresh)
    setUser((await api.get<Me>('/auth/me/')).data)
  }

  const logout = () => { tokens.clear(); setUser(null) }

  const can = (...roles: Me['role'][]) =>
    !!user && (user.is_superuser || user.role === 'admin' || roles.includes(user.role))

  return <Ctx.Provider value={{ user, loading, login, logout, can }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
