import axios, { AxiosError } from 'axios'

export const api = axios.create({ baseURL: '/api' })

const ACCESS = 'erp_access'
const REFRESH = 'erp_refresh'

export const tokens = {
  get access() { return localStorage.getItem(ACCESS) },
  get refresh() { return localStorage.getItem(REFRESH) },
  set(access: string, refresh?: string) {
    localStorage.setItem(ACCESS, access)
    if (refresh) localStorage.setItem(REFRESH, refresh)
  },
  clear() {
    localStorage.removeItem(ACCESS)
    localStorage.removeItem(REFRESH)
  },
}

api.interceptors.request.use((config) => {
  if (tokens.access) config.headers.Authorization = `Bearer ${tokens.access}`
  return config
})

let refreshing: Promise<string> | null = null

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retry?: boolean }) | undefined
    if (error.response?.status === 401 && original && !original._retry && tokens.refresh) {
      original._retry = true
      try {
        refreshing ??= axios
          .post('/api/auth/refresh/', { refresh: tokens.refresh })
          .then((r) => r.data.access as string)
          .finally(() => { refreshing = null })
        const access = await refreshing
        tokens.set(access)
        original.headers.Authorization = `Bearer ${access}`
        return api(original)
      } catch {
        tokens.clear()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

/** DRF xatolarini o'qiladigan matnga aylantiradi. */
export function errorText(e: unknown): string {
  const err = e as AxiosError<Record<string, unknown>>
  const data = err.response?.data
  if (!data) return 'Server bilan aloqa yo\'q'
  if (typeof data === 'string') return 'Server xatosi'
  if (typeof data.detail === 'string') return data.detail
  return Object.entries(data)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : String(v)}`)
    .join('\n')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>
