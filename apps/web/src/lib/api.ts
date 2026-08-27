import axios from 'axios'
import { supabase } from './supabase'

// Dev: относительный /api → Vite-прокси на свободный порт API (см. scripts/dev.mjs +
// vite.config proxy). Браузер на своём origin → без CORS. Прод: как раньше (VITE_API_URL).
const baseURL = import.meta.env.DEV
  ? '/api'
  : (import.meta.env.VITE_API_URL ?? `http://${window.location.hostname}:4000`)

export const api = axios.create({
  baseURL,
  withCredentials: true,  // needed for impersonation cookie fallback
})

// Attach Supabase access token as Bearer header before each request.
// Falls back to cookie (withCredentials) for impersonation sessions.
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }
  return config
})

// On 401: try to refresh the Supabase session once, then retry.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original?._retry) {
      original._retry = true
      const { data: { session } } = await supabase.auth.refreshSession()
      if (session?.access_token) {
        original.headers.Authorization = `Bearer ${session.access_token}`
        return api(original)
      }
    }
    return Promise.reject(error)
  }
)