import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCurrentUser } from '../hooks/useAuth'
import { useAuthStore, type AuthUser } from '../stores/auth'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import { formatName } from '../lib/utils'
import { openInventoryWithSession } from '../lib/sso'
import nexusLogoSrc from '../assets/nexus.svg'
import inventoryLogoSrc from '../assets/logos/inventory.svg'
import { PageHeaderProvider, HeaderSlotTarget } from './HeaderPortal'

// Логотипы продуктов для пунктов-сервисов (внешние/внутренние). Ключ = module.key.
// Значок — из megapolis-platform/brand/logos (скопирован в assets/logos). Нет лого → lucide-фолбэк.
const SERVICE_LOGOS: Record<string, string> = {
  'ext.inventory': inventoryLogoSrc,
}
import { ListsPage }     from '../pages/ListsPage'
import { PersonnelPage } from '../pages/PersonnelPage'
import { HomePage }      from '../pages/HomePage'
import { CalendarPage }  from '../pages/CalendarPage'
import { CabinetPage }   from '../pages/CabinetPage'
import { ProjectsPage }  from '../pages/ProjectsPage'
import type { ProjectsSubPage } from '../pages/ProjectsPage'
import { AnalyticsPage } from '../pages/AnalyticsPage'
import { SettingsPage, RolesTab, BackupsInfo } from '../pages/SettingsPage'
import { TeamPage }      from '../pages/TeamPage'
import { NotificationsPanel } from './NotificationsPanel'
import { useNotificationsBadge } from '../hooks/useNotificationsBadge'
import { useIsMobile } from '../hooks/useIsMobile'
import { ChatsPage, disconnectWS } from '../pages/ChatsPage'
import { ErrorBoundary } from './ErrorBoundary'
import { AppShell as KitAppShell, type NavEntry } from '../ui-kit/components/AppShell'
import {
  Home, Calendar, BarChart3, PieChart, FolderKanban,
  Users, UsersRound, MessageSquare, Bell, Settings as SettingsIcon,
  User, Shield, Archive, List, Package,
  type LucideIcon,
} from 'lucide-react'

type AdminPage = 'personnel' | 'lists' | 'set-roles' | 'set-backups'
type UserPage  = 'home' | 'dashboard' | 'calendar' | 'tasks' | 'projects' | 'analytics' | 'team' | 'settings'
type Page = AdminPage | UserPage

interface ChatsOpenProps {
  initialUserId?: string
  isSelf?: boolean
  initialTask?: { id: string; title: string; assigneeId: string; assignedById: string }
}

interface NavItem {
  id: Page
  label: string
  icon: LucideIcon
}

const ADMIN_NAV: NavItem[] = [
  { id: 'personnel', label: 'Персонал',  icon: Users },
  { id: 'lists',     label: 'Списки',    icon: List },
  { id: 'settings',  label: 'Настройки', icon: SettingsIcon },
]

const USER_NAV: NavItem[] = [
  { id: 'home',      label: 'Пульс',        icon: Home },
  { id: 'dashboard', label: 'Мой кабинет',  icon: User },
  { id: 'calendar',  label: 'Календарь',    icon: Calendar },
  { id: 'analytics', label: 'Аналитика',    icon: PieChart },
  { id: 'projects',  label: 'Проекты',      icon: FolderKanban },
  { id: 'team',      label: 'Команда',      icon: UsersRound },
]

function applyTheme(theme: 'dark' | 'light') {
  document.documentElement.setAttribute('data-theme', theme)
}

// Роль под именем в мини-профиле (сайдбар кита + панель профиля).
function roleLabel(user: AuthUser | null): string {
  if (!user) return ''
  if (user.isSystemAccount) return 'Системный аккаунт'
  if (user.isAdmin) return 'Администратор системы'
  const primaryDiv = user.divMemberships?.[0]
  if (primaryDiv) return `${primaryDiv.position} · ${primaryDiv.division.department.name}`
  const depts = user.access?.departments ?? []
  if (depts.length) {
    const lvl: Record<string, string> = { director: 'Директор', head: 'Руководитель', member: 'Сотрудник' }
    return depts.map((d) => `${d.name} · ${lvl[d.level] ?? d.level}`).join(', ')
  }
  return 'Сотрудник'
}

export function AppShell() {
  const user    = useCurrentUser()
  const setUser = useAuthStore((s) => s.setUser)
  const qc      = useQueryClient()

  const isAdmin = !!user?.isAdmin
  const isSystem = !!user?.isSystemAccount  // мастер-аккаунт: только админка, без рабочего пространства

  const SYSTEM_PAGES: Page[] = ['personnel', 'lists', 'set-roles', 'set-backups']
  const defaultPage: Page = isSystem ? 'personnel' : 'home'
  const ADMIN_PAGES: Page[] = ['personnel', 'lists']
  const storedRaw = localStorage.getItem('nexus:page')
  // Миграция старого persist: «Свод»→«Аналитика», «Задачи»→«Мой кабинет» (обе стали внутр. вкладками)
  const stored = (storedRaw === 'svod' ? 'analytics' : storedRaw === 'tasks' ? 'dashboard' : storedRaw) as Page | null
  const initialPage: Page = isSystem
    ? (stored && SYSTEM_PAGES.includes(stored) ? stored : 'personnel')
    : (stored && (!ADMIN_PAGES.includes(stored) || isAdmin) ? stored : defaultPage)
  const [page, setPage] = useState<Page>(initialPage)

  // Системному аккаунту: вместо «Настроек» — её разделы прямо в Администрировании.
  const adminNav: NavItem[] = isSystem
    ? [
        { id: 'personnel',   label: 'Персонал',       icon: Users },
        { id: 'lists',       label: 'Списки',         icon: List },
        { id: 'set-roles',   label: 'Роли и доступы', icon: Shield },
        { id: 'set-backups', label: 'Бэкапы',         icon: Archive },
      ]
    : ADMIN_NAV

  function navigateTo(p: Page) {
    // «Задачи» переехали внутрь «Мой кабинет» вкладкой — редиректим старые ссылки/уведомления
    if (p === 'tasks') { localStorage.setItem('nexus:cabinet-tab', 'tasks'); p = 'dashboard' }
    setPage(p)
    localStorage.setItem('nexus:page', p)
  }
  const [projectsSubPage, setProjectsSubPage] = useState<ProjectsSubPage>('registry')
  const [chatsProps,  setChatsProps]  = useState<ChatsOpenProps>({})
  const [chatKey,     setChatKey]     = useState(0)
  const [chatOpen,    setChatOpen]    = useState(false)
  const [theme,       setTheme]       = useState<'dark' | 'light'>(user?.theme ?? 'dark')
  const [notifOpen,   setNotifOpen]   = useState(false)
  const isMobile = useIsMobile()

  useEffect(() => {
    const t = user?.theme ?? 'dark'
    setTheme(t)
    applyTheme(t)
  }, [user?.theme])

  const logout = useMutation({
    mutationFn: async () => {
      await supabase.auth.signOut({ scope: 'global' })  // отзыв сессии на сервере → единый логаут (и inventory)
      await api.post('/auth/logout')
    },
    onSettled: () => { disconnectWS(); qc.clear(); setUser(null) },
  })

  const toggleTheme = useMutation({
    mutationFn: (t: 'dark' | 'light') => api.patch('/auth/me/theme', { theme: t }),
    onMutate: (t) => { setTheme(t); applyTheme(t) },
  })

  function openChatWith(userId: string, task: { id: string; title: string; assigneeId: string; assignedById: string }, isSelf: boolean) {
    setChatsProps({ initialUserId: userId, isSelf, initialTask: task })
    setChatKey(k => k + 1)
    setChatOpen(true)
  }

  function openDirectChat(userId: string) {
    setChatsProps({ initialUserId: userId })
    setChatKey(k => k + 1)
    setChatOpen(true)
  }

  const { data: unread = {} } = useQuery<Record<string, number>>({
    queryKey: ['chats:unread'],
    queryFn:  () => api.get('/chats/unread').then(r => r.data),
    refetchInterval: 15_000,
  })
  const totalUnread = Object.values(unread).reduce((s, n) => s + n, 0)
  const notifBadge = useNotificationsBadge(totalUnread)

  const { data: unseenTasks = 0 } = useQuery<number>({
    queryKey: ['tasks:unseen'],
    queryFn:  () => api.get('/tasks/unseen-count').then(r => r.data.count),
    refetchInterval: 15_000,
  })

  // ── nav: USER_NAV/ADMIN_NAV (+ департаментные RBAC-модули, чья страница не входит в USER_NAV) ──
  // Департаментные допмодули — только для не-админов (как в прежнем AppShell): admin уже видит всё
  // через ADMIN_NAV/Настройки.
  // 'svod' — merged-алиас: Свод слит в Аналитику (внутренняя вкладка), отдельной страницы нет;
  // модули с page:'svod' (напр. adm.svod-company) НЕ показываем отдельной вкладкой в меню.
  const navPageIds = new Set([...USER_NAV.map((n) => n.id as string), 'svod'])
  const extraModules = !isAdmin
    ? (user?.access?.modules ?? []).filter((m) => !m.page || !navPageIds.has(m.page))
    : []
  // Три блока под основными вкладками (решение Влада, порядок):
  //   «Платформа»          — функциональные вкладки Nexus для отделов/департаментов/людей (модули без спец-префикса);
  //   «Внутренние сервисы» — отдельные продукты внутреннего домена (int.*: Вики, Облако — пока не заведены);
  //   «Внешние сервисы»    — внешние продукты (ext.*: Инвентаризация, Поддержка…).
  // Блок виден только при наличии модулей своей секции (пустой — не рисуется).
  const sectionOf = (m: { key: string }) =>
    m.key.startsWith('ext.') ? 'Внешние сервисы'
    : m.key.startsWith('int.') ? 'Внутренние сервисы'
    : 'Платформа'
  const sectionOrder = ['Платформа', 'Внутренние сервисы', 'Внешние сервисы']
  const sortedExtra = [...extraModules].sort((a, b) => sectionOrder.indexOf(sectionOf(a)) - sectionOrder.indexOf(sectionOf(b)))

  const navEntries: NavEntry[] = [
    // Основной блок — без секции (заголовка нет)
    ...(!isSystem ? USER_NAV.map((item) => ({
      key: item.id,
      label: item.label,
      icon: item.icon,
      badge: item.id === 'dashboard' && unseenTasks > 0 ? unseenTasks : undefined,
    })) : []),
    // Блоки продуктов/департаментов — по группам (section = m.group)
    ...sortedExtra.map((m) => ({
      key: m.page ?? m.key,
      label: m.name,
      // Продуктовый логотип (iconSrc, кит 1.7.0); lucide — фолбэк, если лого для ключа нет.
      icon: m.key === 'ext.inventory' ? Package : Users,
      iconSrc: SERVICE_LOGOS[m.key],
      section: sectionOf(m),
    })),
    // Админ-блок
    ...(isAdmin ? adminNav.map((item) => ({ key: item.id, label: item.label, icon: item.icon, section: 'Администрирование' })) : []),
  ]

  function handleNavigate(key: string) {
    if (key === 'ext.inventory') { openInventoryWithSession(); return }
    navigateTo(key as Page)
  }

  return (
    <PageHeaderProvider>
      <KitAppShell
        product={{ name: 'Нексус', markSrc: nexusLogoSrc, company: 'Мегаполис Медиа' }}
        nav={navEntries}
        active={page}
        onNavigate={handleNavigate}
        account={{ name: user ? formatName(user.name) : '', role: roleLabel(user), email: user?.email ?? undefined }}
        theme={theme}
        onThemeChange={(t) => toggleTheme.mutate(t)}
        onLogout={() => logout.mutate()}
        profileExtra={<NexusProfileExtra />}
        toolbar={<HeaderSlotTarget />}
        headerActions={<NotifBellHeader badge={notifBadge} onClick={() => setNotifOpen((v) => !v)} />}
        rightPanel={
          <ChatRightPanel
            chatOpen={chatOpen}
            onToggle={() => setChatOpen((v) => !v)}
            chatsProps={chatsProps}
            chatKey={chatKey}
            totalUnread={totalUnread}
          />
        }
      >
        {/* key={page} → при переходе на другую страницу boundary сбрасывается.
            pageLabel из nav → в сообщении видно, какая страница упала (диагностика прода). */}
        <ErrorBoundary key={page} pageLabel={[...USER_NAV, ...adminNav].find((n) => n.id === page)?.label ?? page}>
          {page === 'home'      && <HomePage onOpenChat={openDirectChat} />}
          {page === 'dashboard' && <CabinetPage onOpenChatWith={openChatWith} />}
          {page === 'analytics' && <AnalyticsPage />}
          {page === 'team'      && <TeamPage onOpenChat={openDirectChat} />}
          {page === 'settings'  && isAdmin && <SettingsPage />}
          {page === 'set-roles'   && isAdmin && <div style={{ padding: '24px 28px' }}><RolesTab /></div>}
          {page === 'set-backups' && isAdmin && <div style={{ padding: '24px 28px' }}><BackupsInfo /></div>}
          {page === 'calendar'  && <CalendarPage />}
          {page === 'projects'  && <ProjectsPage subPage={projectsSubPage} onSubPageChange={setProjectsSubPage} />}
          {page === 'personnel' && (isAdmin || user?.access?.modules?.some((m) => m.key === 'hr.orgstructure')) && <PersonnelPage />}
          {page === 'lists'     && isAdmin && <ListsPage />}
        </ErrorBoundary>
      </KitAppShell>

      {notifOpen && (
        <NotificationsPanel
          fullWidth={isMobile}
          unreadChats={totalUnread}
          onClose={() => setNotifOpen(false)}
          onOpenPage={(p) => navigateTo(p as Page)}
          onOpenChats={() => setChatOpen(true)}
        />
      )}
    </PageHeaderProvider>
  )
}

// ── Правый чат-сайдбар (rightPanel кита) — логика/подсчёт непрочитанного не менялись ──────────
function ChatRightPanel({ chatOpen, onToggle, chatsProps, chatKey, totalUnread }: {
  chatOpen: boolean
  onToggle: () => void
  chatsProps: ChatsOpenProps
  chatKey: number
  totalUnread: number
}) {
  return (
    <aside style={{
      height: '100%',
      width: chatOpen ? 480 : 40,
      flexShrink: 0,
      background: 'var(--surface-1)',
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'row',
      transition: 'width 0.2s ease',
      overflow: 'hidden',
    }}>
      {/* Toggle strip — весь кликабельный */}
      <div
        onClick={onToggle}
        title={chatOpen ? 'Скрыть чаты' : 'Чаты'}
        style={{
          width: 40, flexShrink: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          paddingTop: 14, gap: 6,
          borderRight: chatOpen ? '1px solid var(--border)' : 'none',
          cursor: 'pointer',
        }}
      >
        <div style={{ position: 'relative' }}>
          <span style={{ color: 'var(--text-3)', fontSize: 17, lineHeight: 1 }}>
            {chatOpen ? '›' : '‹'}
          </span>
          {!chatOpen && totalUnread > 0 && (
            <span style={{
              position: 'absolute', top: -2, right: -6,
              background: 'linear-gradient(135deg,#FF6B35,#E8194B)',
              color: '#fff', fontSize: 9, fontWeight: 700,
              borderRadius: 8, padding: '1px 4px', lineHeight: 1.4,
              pointerEvents: 'none',
            }}>{totalUnread > 99 ? '99+' : totalUnread}</span>
          )}
        </div>
        {!chatOpen && <MessageSquare size={16} style={{ color: 'var(--text-3)' }} />}
      </div>

      {/* Chat panel */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: chatOpen ? 'flex' : 'none', flexDirection: 'column' }}>
        <ErrorBoundary pageLabel="Чат">
          <ChatsPage key={chatKey} {...chatsProps} compact />
        </ErrorBoundary>
      </div>
    </aside>
  )
}

// ── Колокол уведомлений (headerActions кита — правый край шапки) ───────────────────────────────
// Компактная иконка-кнопка с бейджем-счётчиком; открывает ту же NotificationsPanel.
function NotifBellHeader({ badge, onClick }: { badge: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Уведомления"
      aria-label="Уведомления"
      className="relative grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
    >
      <Bell className="h-[18px] w-[18px]" />
      {badge > 0 && (
        <span
          className="mono absolute -right-0.5 -top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full px-1 text-[10px] font-bold text-white"
          style={{ background: 'linear-gradient(135deg,#FF6B35,#E8194B)' }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}

// ── Продуктовые пункты профиля Nexus (profileExtra кита): статус, позиция/отдел, смена пароля.
// Тема и «Выйти» — уже даёт китовый ProfilePanel, здесь не дублируются. ──────────────────────────
function NexusProfileExtra() {
  const user = useCurrentUser()
  const qc   = useQueryClient()

  const [status, setStatus] = useState(user?.status ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setStatus(user?.status ?? '') }, [user?.status])

  const saveStatus = useMutation({
    mutationFn: (val: string) => api.patch('/auth/me/profile', { status: val || null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  })

  const primaryDiv = user?.divMemberships?.[0]
  const position   = primaryDiv?.position ?? null
  // Если нет членства в отделе — показываем департамент из access (напр. директор без UserDivision)
  const dept = primaryDiv
    ? `${primaryDiv.division.department.name} · ${primaryDiv.division.name}`
    : (user?.access?.departments ?? []).map((d) => {
        const lvl: Record<string, string> = { director: 'Директор', head: 'Руководитель', member: 'Сотрудник' }
        return `${d.name} · ${lvl[d.level] ?? d.level}`
      }).join(', ') || null

  return (
    <div className="flex flex-col gap-6">
      {(position || dept) && (
        <div className="text-center">
          {position && <div className="text-[12px] text-[var(--muted)]">{position}</div>}
          {dept && <div className="mt-0.5 text-[11px] text-[var(--muted)]">{dept}</div>}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="eyebrow">Статус</div>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveStatus.mutate(status)
              if (e.key === 'Escape') { setStatus(user?.status ?? ''); inputRef.current?.blur() }
            }}
            placeholder="Напишите статус…"
            maxLength={200}
            className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--text)] outline-none"
          />
          <button
            onClick={() => saveStatus.mutate(status)}
            disabled={saveStatus.isPending}
            className="rounded-[var(--radius-sm)] bg-[var(--accent)] px-3.5 py-2 text-[13px] font-semibold text-[var(--accent-contrast)] disabled:opacity-60"
          >
            {saveStatus.isPending ? '…' : '✓'}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="eyebrow">Пароль</div>
        <button
          disabled
          className="cursor-not-allowed rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-left text-[13px] text-[var(--muted)]"
        >
          Изменить пароль — скоро
        </button>
      </div>
    </div>
  )
}
