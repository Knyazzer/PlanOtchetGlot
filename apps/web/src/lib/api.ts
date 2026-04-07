import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:4000',
  withCredentials: true,
})

// Авто-обновление токена при 401
// Не перехватываем /auth/* запросы чтобы не зациклиться
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    const isAuthRoute = original?.url?.startsWith('/auth/')

    if (error.response?.status === 401 && !original._retry && !isAuthRoute) {
      original._retry = true
      try {
        await api.post('/auth/refresh')
        return api(original)
      } catch {
        // refresh тоже не прошёл — просто отклоняем, App.tsx покажет LoginPage
      }
    }
    return Promise.reject(error)
  }
)
