import { LogOut } from 'lucide-react'
import { Avatar } from './Avatar'
import { Button } from './primitives'
import { Drawer } from './Drawer'

/**
 * Тело профиля БЕЗ кнопки «Выйти» (её пинит к низу вызывающий): аватар + имя + роль ·
 * «Тема» (если переданы theme/onThemeChange) · слот `extra` (уведомления и прочее продукта) ·
 * Email. Переиспользуется в ЛЕВОЙ панели (десктоп, `ProfilePanel`) и в нижней шторке «Ещё»
 * (мобилка, `AppShell`) — один источник разметки профиля.
 */
export function ProfileBody({
  account,
  theme,
  onThemeChange,
  extra,
  onLogout,
}: {
  account: { name: string; role: string; email?: string }
  theme?: 'dark' | 'light'
  onThemeChange?: (t: 'dark' | 'light') => void
  extra?: React.ReactNode
  /** Если передан — «Выйти» рендерится ВНУТРИ блока профиля (мобилка), неяркой кнопкой. */
  onLogout?: () => void
}) {
  return (
    <>
      <div className="flex flex-col items-center pt-1">
        <Avatar name={account.name} px={64} />
        <div className="mt-3 text-[16px] font-semibold text-[var(--text)]">{account.name}</div>
        <div className="text-[13px] text-[var(--muted)]">{account.role}</div>
      </div>

      {theme && onThemeChange && (
        <div className="mt-7">
          <div className="eyebrow mb-1.5">Тема</div>
          <div className="flex gap-2">
            <Button size="sm" variant={theme === 'dark' ? 'primary' : 'ghost'} onClick={() => onThemeChange('dark')} className="flex-1">Тёмная</Button>
            <Button size="sm" variant={theme === 'light' ? 'primary' : 'ghost'} onClick={() => onThemeChange('light')} className="flex-1">Светлая</Button>
          </div>
        </div>
      )}

      {extra && <div className="mt-6">{extra}</div>}

      {account.email && (
        <div className="mt-6">
          <div className="eyebrow mb-1">Email</div>
          <div className="text-[13px] text-[var(--text)]">{account.email}</div>
        </div>
      )}

      {onLogout && <div className="mt-6 border-t border-[var(--border)] pt-4"><ProfileLogout onLogout={onLogout} /></div>}
    </>
  )
}

/** Кнопка «Выйти» профиля — единый вид (панель и шторка «Ещё»). Неяркая (не solid-red):
 * приглушённая рамка/текст, danger только на hover — чтобы не перетягивала акцент на себя. */
export function ProfileLogout({ onLogout }: { onLogout: () => void }) {
  return (
    <button
      onClick={onLogout}
      className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-[13px] font-medium text-[var(--muted)] transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)]"
    >
      <LogOut className="h-4 w-4" /> Выйти
    </button>
  )
}

/**
 * Канон профиля экосистемы (эталон — support-mediacenter, «как в Nexus»):
 * ЛЕВАЯ тёмная выезжающая панель, не модал и не дропдаун. Открывается кликом по
 * аккаунту в подвале сайдбара (AppShell делает это сам, на десктопе). Закрытие —
 * железным правилом попапов (в Drawer), Esc, ✕. На мобилке отдельной панели нет —
 * профиль живёт в шторке «Ещё» (см. AppShell), собранный из `ProfileBody`.
 *
 * Продукты НЕ делают свой попап профиля — используют этот.
 */
export function ProfilePanel({
  open,
  onClose,
  account,
  onLogout,
  theme,
  onThemeChange,
  extra,
}: {
  open: boolean
  onClose: () => void
  account: { name: string; role: string; email?: string }
  onLogout?: () => void
  /** текущая тема (контролируемая приложением); без пары theme+onThemeChange секция «Тема» скрыта */
  theme?: 'dark' | 'light'
  onThemeChange?: (t: 'dark' | 'light') => void
  /** слот под спец-пункты продукта (напр. переключатель уведомлений) */
  extra?: React.ReactNode
}) {
  return (
    <Drawer open={open} onClose={onClose} side="left" dark title="Профиль" width={300}>
      <div className="flex h-full flex-col">
        <ProfileBody account={account} theme={theme} onThemeChange={onThemeChange} extra={extra} />
        <div className="flex-1" />
        {onLogout && <div className="mt-6"><ProfileLogout onLogout={onLogout} /></div>}
      </div>
    </Drawer>
  )
}
