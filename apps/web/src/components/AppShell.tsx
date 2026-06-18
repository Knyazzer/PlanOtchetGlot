import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCurrentUser } from '../hooks/useAuth'
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import { formatName } from '../lib/utils'
import { openInventoryWithSession } from '../lib/sso'
import { DatabasePage }  from '../pages/DatabasePage'
import { PersonnelPage } from '../pages/PersonnelPage'
import { DashboardPage } from '../pages/DashboardPage'
import { HomePage }      from '../pages/HomePage'
import { CalendarPage }  from '../pages/CalendarPage'
import { TasksPage }     from '../pages/TasksPage'
import { ProjectsPage }  from '../pages/ProjectsPage'
import type { ProjectsSubPage } from '../pages/ProjectsPage'
import { SvodPage }      from '../pages/SvodPage'
import { AnalyticsPage } from '../pages/AnalyticsPage'
import { SettingsPage, FormatsTab, RolesTab, BackupsInfo } from '../pages/SettingsPage'
import { TeamPage }      from '../pages/TeamPage'
import { NotificationsPanel } from './NotificationsPanel'
import { useNotificationsBadge } from '../hooks/useNotificationsBadge'
import { useIsMobile } from '../hooks/useIsMobile'
import { ChatsPage, disconnectWS } from '../pages/ChatsPage'
import { ProfilePanel }  from './ProfilePanel'
import { ErrorBoundary } from './ErrorBoundary'
import { NexusIcon } from './NexusIcon'
import {
  Home, Calendar, ClipboardList, BarChart3, PieChart, FolderKanban,
  Users, UsersRound, Database, LogOut, MessageSquare, Bell, MoreHorizontal, Settings as SettingsIcon,
  User, Shield, Archive,
  type LucideIcon,
} from 'lucide-react'

type AdminPage = 'personnel' | 'database' | 'set-formats' | 'set-roles' | 'set-backups'
type UserPage  = 'home' | 'dashboard' | 'calendar' | 'tasks' | 'projects' | 'svod' | 'analytics' | 'team' | 'settings'
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
  adminOnly: boolean
}

const ADMIN_NAV: NavItem[] = [
  { id: 'personnel', label: 'Персонал',    icon: Users,        adminOnly: true },
  { id: 'database',  label: 'База данных', icon: Database,     adminOnly: true },
  { id: 'settings',  label: 'Настройки',  icon: SettingsIcon, adminOnly: true },
]

const USER_NAV: NavItem[] = [
  { id: 'home',      label: 'Главная',      icon: Home,          adminOnly: false },
  { id: 'dashboard', label: 'Мой кабинет',  icon: User,          adminOnly: false },
  { id: 'calendar',  label: 'Календарь',    icon: Calendar,      adminOnly: false },
  { id: 'tasks',     label: 'Задачи',    icon: ClipboardList, adminOnly: false },
  { id: 'svod',      label: 'Свод',      icon: BarChart3,     adminOnly: false },
  { id: 'analytics', label: 'Аналитика', icon: PieChart,      adminOnly: false },
  { id: 'projects',  label: 'Проекты',   icon: FolderKanban,  adminOnly: false },
  { id: 'team',      label: 'Команда',   icon: UsersRound,    adminOnly: false },
]

// Скин сайдбара: тёмный в ОБЕИХ темах, индиго-акцент.
// Значения — токены kit.css (--sidebar-*), источник: Figma-макет v2 theme.css.
const SB = {
  bg: 'var(--sidebar)',
  border: 'var(--sidebar-border)',
  text: 'var(--sidebar-foreground)',
  dim: 'var(--sidebar-muted)',
  muted: 'var(--sidebar-muted)',
  bright: 'var(--sidebar-accent-foreground)',
  activeBg: 'rgba(99,102,241,0.2)',
  activeText: '#a5b4fc',
} as const

function applyTheme(theme: 'dark' | 'light') {
  document.documentElement.setAttribute('data-theme', theme)
}

export function AppShell() {
  const user    = useCurrentUser()
  const setUser = useAuthStore((s) => s.setUser)
  const qc      = useQueryClient()

  const isAdmin = !!user?.isAdmin
  const isSystem = !!user?.isSystemAccount  // мастер-аккаунт: только админка, без рабочего пространства

  const SYSTEM_PAGES: Page[] = ['personnel', 'database', 'set-formats', 'set-roles', 'set-backups']
  const defaultPage: Page = isSystem ? 'personnel' : 'home'
  const ADMIN_PAGES: Page[] = ['personnel', 'database']
  const stored = localStorage.getItem('nexus:page') as Page | null
  const initialPage: Page = isSystem
    ? (stored && SYSTEM_PAGES.includes(stored) ? stored : 'personnel')
    : (stored && (!ADMIN_PAGES.includes(stored) || isAdmin) ? stored : defaultPage)
  const [page, setPage] = useState<Page>(initialPage)

  // Системному аккаунту: вместо «Настроек» — её разделы прямо в Администрировании.
  const adminNav: NavItem[] = isSystem
    ? [
        { id: 'personnel',   label: 'Персонал',       icon: Users,    adminOnly: true },
        { id: 'database',    label: 'База данных',    icon: Database,  adminOnly: true },
        { id: 'set-formats', label: 'Форматы дня',    icon: Calendar,  adminOnly: true },
        { id: 'set-roles',   label: 'Роли и доступы', icon: Shield,    adminOnly: true },
        { id: 'set-backups', label: 'Бэкапы',         icon: Archive,   adminOnly: true },
      ]
    : ADMIN_NAV

  function navigateTo(p: Page) {
    setPage(p)
    localStorage.setItem('nexus:page', p)
  }
  const [projectsSubPage, setProjectsSubPage] = useState<ProjectsSubPage>('registry')
  const [chatsProps,  setChatsProps]  = useState<ChatsOpenProps>({})
  const [chatKey,     setChatKey]     = useState(0)
  const [chatOpen,    setChatOpen]    = useState(false)
  const [collapsed,   setCollapsed]   = useState(false)
  const [theme,       setTheme]       = useState<'dark' | 'light'>(user?.theme ?? 'dark')
  const [profileOpen, setProfileOpen] = useState(false)
  const [notifOpen,   setNotifOpen]   = useState(false)
  const isMobile = useIsMobile()
  const [mobileMore,  setMobileMore]  = useState(false)

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

  const sidebarW = collapsed ? 56 : 220

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)', fontFamily: 'Inter, sans-serif', color: 'var(--text-1)' }}>
      <ProfilePanel
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        theme={theme}
        onToggleTheme={() => toggleTheme.mutate(theme === 'dark' ? 'light' : 'dark')}
      />

      {/* ── Sidebar — тёмный slate в обеих темах (скин Figma) ─────────────── */}
      <aside style={{
        display: isMobile ? 'none' : 'flex',
        width: sidebarW, flexShrink: 0,
        background: SB.bg,
        borderRight: `1px solid ${SB.border}`,
        flexDirection: 'column',
        transition: 'width 0.2s ease',
        overflow: 'hidden',
      }}>

        {/* Logo */}
        <div style={{
          height: 64, flexShrink: 0,
          display: 'flex', alignItems: 'center',
          padding: collapsed ? '0 14px' : '0 16px',
          borderBottom: `1px solid ${SB.border}`, gap: 10,
        }}>
          <div
            onClick={() => collapsed && setCollapsed(false)}
            style={{ display: 'flex', cursor: collapsed ? 'pointer' : 'default' }}
            title={collapsed ? 'Развернуть' : undefined}
          >
            <NexusIcon size={28} />
          </div>
          {!collapsed && (
            <span style={{ flex: 1, fontSize: 15, fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.3px' }}>
              Нексус
            </span>
          )}
          <button
            onClick={() => setCollapsed(v => !v)}
            title={collapsed ? 'Развернуть' : 'Свернуть'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: SB.dim, fontSize: 16, padding: 4, lineHeight: 1, flexShrink: 0 }}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto', overflowX: 'hidden' }}>
          {/* User section divider for admins */}
          {isAdmin && !isSystem && !collapsed && (
            <div style={{ fontSize: 9, fontWeight: 700, color: SB.muted, letterSpacing: '0.8px', textTransform: 'uppercase', padding: '4px 12px 6px' }}>
              Рабочее пространство
            </div>
          )}
          {!isSystem && USER_NAV.map(item => (
            <div key={item.id}>
              <NavBtn item={item} active={page === item.id} collapsed={collapsed} onClick={() => navigateTo(item.id)} badge={item.id === 'tasks' ? unseenTasks : 0} />
              {item.id === 'projects' && page === 'projects' && !collapsed && (
                <div style={{ paddingLeft: 16, marginTop: 1, marginBottom: 4, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <SubNavBtn label="Реестр" active={projectsSubPage === 'registry'} onClick={() => setProjectsSubPage('registry')} />
                  <SubNavBtn label="Workflow" active={projectsSubPage === 'workflow'} onClick={() => setProjectsSubPage('workflow')} />
                </div>
              )}
            </div>
          ))}

          {/* Департаментные модули (КИТ 1): только те, чья страница НЕ входит в USER_NAV.
              Это скрывает дублирующие пункты (prod.board→tasks, prod.workitems→projects и т.п.)
              и оставляет только реально дополнительный доступ (personnel, database). */}
          {!isAdmin && !collapsed && (() => {
            const navPageIds = new Set(USER_NAV.map(n => n.id as string))
            const extraModules = (user?.access?.modules ?? []).filter(m => !m.page || !navPageIds.has(m.page))
            if (!extraModules.length) return null
            const groups = [...new Set(extraModules.map(m => m.group))]
            return (
              <>
                {groups.map(group => (
                  <div key={group}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: SB.muted, letterSpacing: '0.8px', textTransform: 'uppercase', padding: '12px 12px 6px', marginTop: 4 }}>
                      {group}
                    </div>
                    {extraModules.filter(m => m.group === group).map(m => (
                      <button
                        key={m.key}
                        onClick={() => {
                          if (m.page) navigateTo(m.page as Page)
                          else if (m.key === 'ext.inventory') openInventoryWithSession()
                        }}
                        title={m.mode === 'view' ? `${m.name} — только просмотр` : m.name}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                          padding: '7px 12px', borderRadius: 8, border: 'none',
                          background: 'transparent',
                          cursor: (m.page || m.key === 'ext.inventory') ? 'pointer' : 'default',
                          color: SB.text, fontFamily: 'inherit', fontSize: 12, textAlign: 'left',
                        }}
                      >
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                        {m.mode === 'view' && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: SB.dim, border: `1px solid ${SB.border}`, borderRadius: 8, padding: '0 5px', flexShrink: 0 }}>
                            просмотр
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
              </>
            )
          })()}

          {isAdmin && (
            <>
              {!collapsed && (
                <div style={{ fontSize: 9, fontWeight: 700, color: SB.muted, letterSpacing: '0.8px', textTransform: 'uppercase', padding: '12px 12px 6px', marginTop: 4 }}>
                  Администрирование
                </div>
              )}
              {isAdmin && collapsed && <div style={{ margin: '8px 0', borderTop: `1px solid ${SB.border}` }} />}
              {adminNav.map(item => <NavBtn key={item.id} item={item} active={page === item.id} collapsed={collapsed} onClick={() => navigateTo(item.id)} />)}
            </>
          )}
        </nav>

        {/* Notifications bell */}
        <div style={{ padding: collapsed ? '0 8px 4px' : '0 12px 4px' }}>
          <button onClick={() => setNotifOpen(v => !v)} title="Уведомления" style={{
            display: 'flex', alignItems: 'center', gap: 9, width: '100%',
            padding: collapsed ? '8px 0' : '8px 10px', justifyContent: collapsed ? 'center' : 'flex-start',
            borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer',
            color: SB.text, fontFamily: 'inherit', fontSize: 13,
          }}>
            <span style={{ position: 'relative', display: 'flex' }}>
              <Bell size={16} />
              {notifBadge > 0 && (
                <span style={{ position: 'absolute', top: -3, right: -4, width: 7, height: 7, background: '#E8194B', borderRadius: '50%', border: '1.5px solid var(--sidebar)' }} />
              )}
            </span>
            {!collapsed && <span style={{ flex: 1, textAlign: 'left' }}>Уведомления</span>}
            {!collapsed && notifBadge > 0 && (
              <span style={{ background: 'rgba(232,25,75,0.18)', color: '#f87171', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700, fontFamily: 'monospace' }}>{notifBadge > 99 ? '99+' : notifBadge}</span>
            )}
          </button>
        </div>

        {/* Bottom */}
        <div style={{ borderTop: `1px solid ${SB.border}`, padding: collapsed ? '12px 8px' : '12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!collapsed && (
            <div style={{ padding: '4px 4px 8px', borderBottom: `1px solid ${SB.border}` }}>
              <button
                onClick={() => setProfileOpen(v => !v)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', width: '100%' }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: SB.bright, textDecoration: 'underline dotted', textUnderlineOffset: 3 }}>
                  {user ? formatName(user.name) : ''}
                </div>
              </button>
              {isAdmin && (
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-s)', letterSpacing: '0.5px', textTransform: 'uppercase', marginTop: 2 }}>
                  Администратор системы
                </div>
              )}
              {user?.status && (
                <div style={{ fontSize: 11, color: SB.dim, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.status}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            title="Выйти"
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: collapsed ? '8px 0' : '8px 8px', justifyContent: collapsed ? 'center' : 'flex-start', background: 'none', border: '1px solid transparent', borderRadius: 8, cursor: 'pointer', color: SB.text, fontSize: 13, fontFamily: 'Inter, sans-serif' }}
          >
            <LogOut size={15} />
            {!collapsed && <span>{logout.isPending ? 'Выход...' : 'Выйти'}</span>}
          </button>
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, overflow: 'auto', background: 'var(--bg)', minWidth: 0, paddingBottom: isMobile ? 56 : 0 }}>
        {/* key={page} → при переходе на другую страницу boundary сбрасывается.
            pageLabel из nav → в сообщении видно, какая страница упала (диагностика прода). */}
        <ErrorBoundary key={page} pageLabel={[...USER_NAV, ...adminNav].find(n => n.id === page)?.label ?? page}>
          {page === 'home'      && <HomePage />}
          {page === 'dashboard' && <DashboardPage />}
          {page === 'svod'      && <SvodPage />}
          {page === 'analytics' && <AnalyticsPage />}
          {page === 'team'      && <TeamPage onOpenChat={openDirectChat} />}
          {page === 'settings'  && isAdmin && <SettingsPage />}
          {page === 'set-formats' && isAdmin && <div style={{ padding: '24px 28px' }}><FormatsTab /></div>}
          {page === 'set-roles'   && isAdmin && <div style={{ padding: '24px 28px' }}><RolesTab /></div>}
          {page === 'set-backups' && isAdmin && <div style={{ padding: '24px 28px' }}><BackupsInfo /></div>}
          {page === 'calendar'  && <CalendarPage />}
          {page === 'tasks'     && <TasksPage onOpenChatWith={openChatWith} />}
          {page === 'projects'  && <ProjectsPage subPage={projectsSubPage} onSubPageChange={setProjectsSubPage} />}
          {page === 'personnel' && (isAdmin || user?.access?.modules?.some(m => m.key === 'hr.orgstructure')) && <PersonnelPage />}
          {page === 'database'  && isAdmin && <DatabasePage />}
        </ErrorBoundary>
      </main>

      {/* ── Chat sidebar (right) ──────────────────────────────────────────── */}
      <aside style={{
        ...(isMobile
          ? (chatOpen
              ? { position: 'fixed' as const, inset: 0, zIndex: 240, width: 'auto' }
              : { display: 'none' })
          : { width: chatOpen ? 480 : 40 }),
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
          onClick={() => setChatOpen(v => !v)}
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

      {notifOpen && (
        <NotificationsPanel
          fullWidth={isMobile}
          unreadChats={totalUnread}
          onClose={() => setNotifOpen(false)}
          onOpenPage={p => navigateTo(p as Page)}
          onOpenChats={() => setChatOpen(true)}
        />
      )}

      {/* Мобильная нижняя навигация (карта: docs/DESIGN.md, раздел «Мобильная версия») */}
      {isMobile && (
        <nav style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 230,
          height: 56, display: 'flex', alignItems: 'stretch',
          background: SB.bg, borderTop: `1px solid ${SB.border}`,
        }}>
          {([
            { id: 'home', label: 'Главная', icon: Home },
            { id: 'tasks',     label: 'Задачи',  icon: ClipboardList },
            { id: 'svod',      label: 'Свод',    icon: BarChart3 },
          ] as Array<{ id: Page; label: string; icon: LucideIcon }>).map(item => {
            const Icon = item.icon
            const active = page === item.id && !chatOpen
            return (
              <button key={item.id}
                onClick={() => { setChatOpen(false); setMobileMore(false); navigateTo(item.id) }}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: active ? SB.activeText : SB.text, fontFamily: 'inherit', fontSize: 9, fontWeight: active ? 700 : 500,
                }}>
                <Icon size={18} />
                {item.label}
              </button>
            )
          })}
          <button onClick={() => { setMobileMore(false); setChatOpen(v => !v) }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', color: chatOpen ? SB.activeText : SB.text, fontFamily: 'inherit', fontSize: 9, fontWeight: chatOpen ? 700 : 500 }}>
            <span style={{ position: 'relative', display: 'flex' }}>
              <MessageSquare size={18} />
              {totalUnread > 0 && <span style={{ position: 'absolute', top: -3, right: -5, width: 7, height: 7, background: '#E8194B', borderRadius: '50%' }} />}
            </span>
            Чаты
          </button>
          <button onClick={() => { setChatOpen(false); setMobileMore(v => !v) }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', color: mobileMore ? SB.activeText : SB.text, fontFamily: 'inherit', fontSize: 9, fontWeight: mobileMore ? 700 : 500 }}>
            <span style={{ position: 'relative', display: 'flex' }}>
              <MoreHorizontal size={18} />
              {notifBadge > 0 && <span style={{ position: 'absolute', top: -3, right: -5, width: 7, height: 7, background: '#E8194B', borderRadius: '50%' }} />}
            </span>
            Ещё
          </button>
        </nav>
      )}

      {/* «Ещё»-меню: второстепенные разделы + уведомления, тема, выход */}
      {isMobile && mobileMore && (
        <div onMouseDown={e => { if (e.target === e.currentTarget) setMobileMore(false) }}
          style={{ position: 'fixed', inset: 0, bottom: 56, zIndex: 229, background: 'rgba(0,0,0,0.35)' }}>
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            background: 'var(--surface-1)', borderTop: '1px solid var(--border)',
            borderRadius: '14px 14px 0 0', padding: '12px 14px 14px',
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
          }}>
            {([
              { id: 'calendar',  label: 'Календарь',  icon: Calendar },
              { id: 'analytics', label: 'Аналитика',  icon: PieChart },
              { id: 'projects',  label: 'Проекты',    icon: FolderKanban },
              { id: 'team',      label: 'Команда',    icon: UsersRound },
              { id: 'settings',  label: 'Настройки',  icon: SettingsIcon },
              ...(isAdmin ? [
                { id: 'personnel' as Page, label: 'Персонал', icon: Users },
                { id: 'database' as Page,  label: 'База данных', icon: Database },
              ] : []),
            ] as Array<{ id: Page; label: string; icon: LucideIcon }>).map(item => {
              const Icon = item.icon
              return (
                <button key={item.id}
                  onClick={() => { setMobileMore(false); navigateTo(item.id) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, padding: '11px 12px',
                    borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)',
                    color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer', textAlign: 'left',
                  }}>
                  <Icon size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  {item.label}
                </button>
              )
            })}
            <button onClick={() => { setMobileMore(false); setNotifOpen(true) }}
              style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
              <Bell size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              Уведомления{notifBadge > 0 ? ` (${notifBadge})` : ''}
            </button>
            <button onClick={() => logout.mutate()}
              style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--danger)', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer', textAlign: 'left', gridColumn: '1 / -1' }}>
              <LogOut size={16} style={{ flexShrink: 0 }} />
              Выйти
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SubNavBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
      padding: '5px 10px',
      background: active ? SB.activeBg : 'none',
      border: '1px solid transparent',
      borderRadius: 6, cursor: 'pointer',
      color: active ? SB.activeText : SB.text,
      fontSize: 12, fontWeight: active ? 600 : 400,
      fontFamily: 'Inter, sans-serif',
      transition: 'background 0.12s, color 0.12s',
    }}>
      <span style={{ width: 3, height: 3, borderRadius: '50%', background: active ? SB.activeText : SB.text, flexShrink: 0, opacity: 0.6 }} />
      {label}
    </button>
  )
}

function NavBtn({ item, active, collapsed, onClick, badge = 0 }: { item: NavItem; active: boolean; collapsed: boolean; onClick: () => void; badge?: number }) {
  const Icon = item.icon
  return (
    <button
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: collapsed ? '10px 0' : '9px 12px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        background: active ? SB.activeBg : 'none',
        border: '1px solid transparent',
        borderRadius: 8, cursor: 'pointer',
        color: active ? SB.activeText : SB.text,
        fontSize: 13, fontWeight: active ? 600 : 500,
        fontFamily: 'Inter, sans-serif', marginBottom: 2,
        transition: 'background 0.12s, color 0.12s',
        whiteSpace: 'nowrap', overflow: 'hidden',
        position: 'relative',
      }}
    >
      <span style={{ flexShrink: 0, position: 'relative', display: 'flex' }}>
        <Icon size={16} />
        {badge > 0 && collapsed && (
          <span style={{
            position: 'absolute', top: -4, right: -6,
            background: 'linear-gradient(135deg,#FF6B35,#E8194B)',
            color: '#fff', fontSize: 9, fontWeight: 700,
            borderRadius: 8, padding: '1px 4px', lineHeight: 1.4,
            pointerEvents: 'none',
          }}>{badge > 99 ? '99+' : badge}</span>
        )}
      </span>
      {!collapsed && <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>}
      {!collapsed && badge > 0 && (
        <span style={{
          background: 'linear-gradient(135deg,#FF6B35,#E8194B)',
          color: '#fff', fontSize: 10, fontWeight: 700,
          borderRadius: 10, padding: '1px 7px', flexShrink: 0,
        }}>{badge > 99 ? '99+' : badge}</span>
      )}
    </button>
  )
}
