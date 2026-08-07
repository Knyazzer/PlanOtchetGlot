import { supabase } from './supabase'

// Белый список доменов для SSO-редиректа (защита от open-redirect / угона токенов).
// Разрешены сами домены и любые их поддомены.
const ALLOWED_SUFFIXES = ['knzteam.ru', 'megapolis.media']

/** Читает ?redirect= из URL и возвращает его, только если домен в белом списке. Иначе null. */
export function getValidatedRedirect(): string | null {
  const raw = new URLSearchParams(window.location.search).get('redirect')
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    const host = url.hostname
    const ok = ALLOWED_SUFFIXES.some((s) => host === s || host.endsWith('.' + s))
    // Только origin+path — отрезаем query и hash, чтобы при петле SSO URL не рос (иначе 414)
    return ok ? url.origin + url.pathname : null
  } catch {
    return null
  }
}

/**
 * Защита от петли SSO: true, если на этот target уже редиректили слишком часто
 * за короткое окно (целевое приложение не приняло сессию и отбивает обратно).
 */
export function isSsoRedirectLoop(target: string): boolean {
  try {
    const key = 'sso_redirect_guard'
    const now = Date.now()
    let d = JSON.parse(sessionStorage.getItem(key) || 'null') as { target: string; t0: number; count: number } | null
    if (!d || d.target !== target || now - d.t0 > 15000) d = { target, t0: now, count: 0 }
    d.count++
    sessionStorage.setItem(key, JSON.stringify(d))
    return d.count > 3
  } catch {
    return false
  }
}

/**
 * Передаёт текущую Supabase-сессию на redirect-домен через URL-хеш
 * (#access_token=…&refresh_token=…). Возвращает false, если сессии нет.
 */
export async function redirectWithSession(redirect: string): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return false
  const params = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token ?? '',
  })
  window.location.href = `${redirect}#${params.toString()}`
  return true
}

const INVENTORY_URL = import.meta.env.VITE_INVENTORY_URL ?? ''

/**
 * Открывает Инвентаризацию в новой вкладке, передав текущую Supabase-сессию
 * через URL-хеш (#access_token=…&refresh_token=…). false, если нет URL или сессии.
 */
export async function openInventoryWithSession(): Promise<boolean> {
  if (!INVENTORY_URL) return false
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return false
  const params = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token ?? '',
  })
  window.open(`${INVENTORY_URL}/#${params.toString()}`, '_blank', 'noopener,noreferrer')
  return true
}