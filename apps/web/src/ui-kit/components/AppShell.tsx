import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronLeft, Menu } from 'lucide-react'
import { Icon } from './Icon'
import { Avatar } from './Avatar'
import { Sheet } from './Sheet'
import { ProfilePanel, ProfileBody } from './ProfilePanel'
import { Logo as BrandLogo } from './Logo'
import { cn } from '../lib/cn'

export interface NavChild { key: string; label: string; badge?: number }
export interface NavEntry {
  key: string
  label: string
  icon: LucideIcon
  badge?: number
  children?: NavChild[]
  /** действие-кнопка справа в пункте (напр. «+» создать) — появляется на ховере строки */
  action?: { icon: LucideIcon; onClick: () => void; title?: string }
}

/**
 * Единый каркас продукта экосистемы. Один на всех; различаются только nav-пункты
 * (конфиг) и данные. Сайдбар всегда тёмный (канон Nexus). Адаптив: сайдбар (десктоп)
 * → нижняя навигация (мобилка). Логотип сверху, аккаунт и «В Nexus» снизу.
 */
export function AppShell({
  product,
  nav,
  active,
  onNavigate,
  account,
  onReturnToNexus,
  onLogout,
  theme,
  onThemeChange,
  profileExtra,
  footerExtra,
  subtitle,
  toolbar,
  children,
}: {
  product: { name: string; mark?: string; markSrc?: string; company?: string }
  nav: NavEntry[]
  active: string
  onNavigate: (key: string) => void
  account: { name: string; role: string; email?: string }
  onReturnToNexus?: () => void
  /** «Выйти» в панели профиля (если не передан — кнопки нет) */
  onLogout?: () => void
  /** тема для переключателя в профиле (контролируемая приложением) */
  theme?: 'dark' | 'light'
  onThemeChange?: (t: 'dark' | 'light') => void
  /** слот спец-пунктов продукта в панели профиля (напр. уведомления) */
  profileExtra?: React.ReactNode
  /** слот в подвале сайдбара НАД аккаунтом (напр. вспомогательная ссылка) */
  footerExtra?: React.ReactNode
  /** подзаголовок раздела в шапке (описание страницы: настройки/подсказки) */
  subtitle?: React.ReactNode
  toolbar?: React.ReactNode
  children: React.ReactNode
}) {
  const activeTop = nav.find((n) => n.key === active || n.children?.some((c) => c.key === active))
  const [moreOpen, setMoreOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  // список навигации (переиспользуется в десктоп-сайдбаре и мобильном «Ещё»-drawer)
  const navList = (onPick: (k: string) => void) => (
    <nav className="p-2">
      {nav.map((n) => {
        const on = n.key === active || n.children?.some((c) => c.key === active)
        return (
          <div key={n.key} className="group/nav">
            <div className="relative">
            <button
              onClick={() => onPick(n.children?.[0]?.key ?? n.key)}
              className={cn('relative flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13.5px] outline-none transition-colors', on ? 'bg-[var(--accent-soft)] text-[var(--text)]' : 'text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]')}
            >
              {on && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-[var(--accent)]" />}
              <Icon icon={n.icon} size="sm" className={on ? 'text-[var(--accent)]' : ''} />
              <span className="flex-1 text-left">{n.label}</span>
              {n.badge != null && <span className="mono rounded-full bg-[var(--surface-3)] px-1.5 text-[11px] text-[var(--muted)]">{n.badge}</span>}
            </button>
            {n.action && (
              <button
                onClick={(e) => { e.stopPropagation(); n.action!.onClick() }}
                title={n.action.title}
                className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-[6px] text-[var(--muted)] opacity-0 transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)] group-hover/nav:opacity-100"
              >
                <Icon icon={n.action.icon} size="sm" />
              </button>
            )}
            </div>
            {on && n.children && (
              <div className="mb-1 ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-[var(--border)] pl-2">
                {n.children.map((c) => {
                  const cOn = c.key === active
                  return (
                    <button key={c.key} onClick={() => onPick(c.key)} className={cn('flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[13px] outline-none transition-colors', cOn ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]' : 'text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]')}>
                      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', cOn ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]')} />
                      <span className="flex-1 truncate">{c.label}</span>
                      {c.badge != null && <span className="mono shrink-0 text-[11px] text-[var(--muted)]">{c.badge}</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )

  const footer = (
    <div className="border-t border-[var(--border)] p-2">
      {footerExtra && <div className="mb-1">{footerExtra}</div>}
      {onReturnToNexus && (
        <button onClick={onReturnToNexus} className="mb-1 flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
          <Icon icon={ChevronLeft} size="sm" /> Вернуться в Nexus
        </button>
      )}
      <button
        onClick={() => setProfileOpen(true)}
        className="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface-2)]"
        aria-label="Профиль"
      >
        <Avatar name={account.name} size="lg" />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13px] font-medium text-[var(--text)]">{account.name}</div>
          <div className="truncate text-[11px] text-[var(--muted)]">{account.role}</div>
        </div>
      </button>
    </div>
  )

  // нижняя навигация: 4 быстрых пункта + «Ещё» (если пунктов больше).
  // overflow — то, что НЕ поместилось в панель; показывается только оно в «Ещё» (не дубли).
  const primary = nav.slice(0, nav.length > 5 ? 4 : 5)
  const overflow = nav.slice(primary.length)

  // Лакап — ЕДИНЫЙ канон-компонент Logo кита (и для SVG-марки, и для буквенной):
  // один рендерер → отступы/шрифт/вес идентичны везде (меню, логин, плейграунд).
  // size sm — канон для узких мест (сайдбар).
  const Logo = <BrandLogo iconSrc={product.markSrc} mark={product.mark} name={product.name} company={product.company} size="sm" />

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg)]">
      {/* ── Сайдбар (десктоп), всегда тёмный ── */}
      <aside className="sidebar-dark hidden w-60 shrink-0 flex-col border-r border-[var(--border)] md:flex">
        <div className="flex h-14 items-center border-b border-[var(--border)] px-4">{Logo}</div>
        <div className="flex-1 overflow-y-auto">{navList(onNavigate)}</div>
        {footer}
      </aside>

      {/* ── Основная область ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* тулбар */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] px-4">
          <div className="md:hidden">{Logo}</div>
          {/* тулбар (настройки страницы) занимает шапку слева; если его нет — показываем
              название активного раздела. */}
          {/* название раздела + подзаголовок (описание/подсказки страницы) слева */}
          <div className="hidden min-w-0 md:block">
            <div className="truncate text-[14px] font-semibold text-[var(--text)]">{activeTop?.label ?? product.name}</div>
            {subtitle && <div className="truncate text-[12px] leading-tight text-[var(--muted)]">{subtitle}</div>}
          </div>
          {toolbar && <div className="ml-auto flex items-center gap-3">{toolbar}</div>}
        </header>

        {/* контент (гориз. скролл страницы заблокирован — у тяжёлых компонентов свой внутренний скролл).
            Нижний отступ на мобилке — под плавающую панель навигации (её высота + safe-area). */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>

        {/* нижняя навигация (мобилка): плавающая скруглённая панель поверх страницы.
            Крупные тап-таргеты (≥44px, Fitts), подписи в 2 строки, отступ от низа с учётом safe-area iOS. */}
        <nav className="fixed inset-x-0 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex w-[min(96%,480px)] items-stretch justify-around gap-1 rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[0_12px_38px_-8px_rgba(0,0,0,0.55)] md:hidden">
          {primary.map((n) => {
            const on = n.key === active || n.children?.some((c) => c.key === active)
            return (
              <button key={n.key} onClick={() => onNavigate(n.children?.[0]?.key ?? n.key)} className={cn('flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-1 rounded-[20px] px-1 py-1.5 outline-none transition-colors', on ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--muted)]')}>
                <Icon icon={n.icon} size="md" />
                <span className="line-clamp-2 max-w-full text-center text-[11px] font-medium leading-[1.15]">{n.label}</span>
              </button>
            )
          })}
          {overflow.length > 0 && (
            (() => {
              const moreActive = !primary.some((n) => n.key === active || n.children?.some((c) => c.key === active))
              return (
                <button onClick={() => setMoreOpen(true)} className={cn('flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-1 rounded-[20px] px-1 py-1.5 outline-none transition-colors', moreActive ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--muted)]')}>
                  <Icon icon={Menu} size="md" />
                  <span className="text-center text-[11px] font-medium leading-[1.15]">Ещё</span>
                </button>
              )
            })()
          )}
        </nav>

        {/* «Ещё» — нижний sheet (мобилка). Сверху — ПРОФИЛЬ (отдельной левой панели на мобилке нет:
            профиль собран здесь из ProfileBody), ниже — только НЕ поместившиеся разделы (overflow),
            затем действия (клиентский вход / В Nexus / Выйти). */}
        <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Меню">
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-4">
            {/* На мобилке «Выйти» живёт ВНУТРИ блока профиля (неяркой кнопкой), не отдельным акцентным блоком снизу. */}
            <ProfileBody account={account} theme={theme} onThemeChange={onThemeChange} extra={profileExtra} onLogout={onLogout} />
          </div>

          {overflow.length > 0 && (
            <div className="mt-4">
              <div className="eyebrow mb-2">Разделы</div>
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {overflow.map((n) => {
                  const on = n.key === active || n.children?.some((c) => c.key === active)
                  return (
                    <button
                      key={n.key}
                      onClick={() => { onNavigate(n.children?.[0]?.key ?? n.key); setMoreOpen(false) }}
                      className={cn('flex flex-col items-center gap-2 rounded-[var(--radius)] border p-3 text-center outline-none transition-colors', on ? 'border-[var(--accent-line)] bg-[var(--accent-soft)]' : 'border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]')}
                    >
                      <span className={cn('grid h-11 w-11 place-items-center rounded-full', on ? 'bg-[var(--accent)] text-[var(--accent-contrast)]' : 'bg-[var(--surface-3)] text-[var(--muted)]')}>
                        <Icon icon={n.icon} size="lg" />
                      </span>
                      <span className={cn('text-[12px] leading-tight', on ? 'font-medium text-[var(--accent)]' : 'text-[var(--text)]')}>{n.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {(footerExtra || onReturnToNexus) && (
            <div className="mt-4 flex flex-col gap-2 border-t border-[var(--border)] pt-4">
              {footerExtra}
              {onReturnToNexus && (
                <button onClick={() => { setMoreOpen(false); onReturnToNexus() }} className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
                  <Icon icon={ChevronLeft} size="sm" /> Вернуться в Nexus
                </button>
              )}
            </div>
          )}
        </Sheet>

        {/* Профиль — единая левая тёмная панель (канон, ДЕСКТОП). Открывается из подвала сайдбара. */}
        <ProfilePanel
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          account={account}
          onLogout={onLogout}
          theme={theme}
          onThemeChange={onThemeChange}
          extra={profileExtra}
        />
      </div>
    </div>
  )
}
