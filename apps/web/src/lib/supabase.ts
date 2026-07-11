import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL     ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

// В dev вход идёт через /auth/dev-login — Supabase не задействован (см. CLAUDE.md).
// Если переменные не заданы (локальная разработка без прод-env), не роняем приложение
// белым экраном на createClient, а подставляем плейсхолдеры: методы Supabase в dev не вызываются.
// В проде переменные заданы → используются реальные значения (поведение не меняется).
export const supabase = createClient(
  supabaseUrl || 'http://localhost:54321',
  supabaseAnonKey || 'dev-placeholder-anon-key',
)
