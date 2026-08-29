import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Shield, Database, Plus, Trash2, CalendarDays } from 'lucide-react'
import { api } from '../lib/api'
import { toast } from '../lib/toast'
import { useConfirm } from '../components/ConfirmModal'
import { useCurrentUser } from '../hooks/useAuth'

// Настройки. Вкладки: «Форматы дня» (admin/HR), «Роли и доступы» + «Бэкапы» (admin).
// Профиль/тема/статус/пароль — в панели профиля (клик по имени в сайдбаре).

type Tab = 'formats' | 'roles' | 'backups'

export function SettingsPage() {
  const user = useCurrentUser()
  const isAdmin = !!user?.isAdmin
  // HR (модуль hr.orgstructure/hr.absences с правкой) может вести справочник форматов дня
  const canFormats = isAdmin || (user?.access?.modules ?? []).some(m => (m.key === 'hr.orgstructure' || m.key === 'hr.absences') && m.mode === 'edit')

  const TABS: Array<{ id: Tab; label: string; icon: React.ElementType; show: boolean }> = [
    { id: 'formats',   label: 'Форматы дня',    icon: CalendarDays, show: canFormats },
    { id: 'roles',     label: 'Роли и доступы', icon: Shield,       show: isAdmin },
    { id: 'backups',   label: 'Бэкапы',         icon: Database,     show: isAdmin },
  ]
  const visibleTabs = TABS.filter(t => t.show)
  const [tab, setTab] = useState<Tab>(() => (isAdmin ? 'roles' : 'formats'))

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Tabs rail */}
      <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--border)', padding: '20px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <h1 style={{ margin: '0 8px 14px', fontSize: 22, fontWeight: 800, color: 'var(--text-1)' }}>Настройки</h1>
        {visibleTabs.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 9, width: '100%',
              padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: tab === t.id ? 'var(--surface-2)' : 'transparent',
              color: tab === t.id ? 'var(--text-1)' : 'var(--text-3)',
              fontFamily: 'inherit', fontSize: 14, fontWeight: tab === t.id ? 600 : 400, textAlign: 'left',
            }}>
              <Icon size={15} style={{ flexShrink: 0 }} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        {tab === 'formats' && canFormats && <FormatsTab />}
        {tab === 'roles' && isAdmin && <RolesTab />}
        {tab === 'backups' && isAdmin && <BackupsInfo />}
      </div>
    </div>
  )
}

export function BackupsInfo() {
  return (
    <Placeholder
      title="Бэкапы"
      text="Управление резервными копиями из интерфейса — в плане. Автоматический бэкап PostgreSQL на VDS на данный момент не настроен в репозитории (проверить host-cron на сервере)."
    />
  )
}

function Placeholder({ title, text, action }: { title: string; text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div style={{ maxWidth: 520 }}>
      <h2 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>{title}</h2>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--text-3)', lineHeight: 1.5 }}>{text}</p>
      {action && (
        <button onClick={action.onClick} style={{ marginTop: 14, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 14, cursor: 'pointer' }}>
          {action.label}
        </button>
      )}
    </div>
  )
}

// ── Форматы дня: правка → новая версия с текущего периода (Q-DAY-5) ───────────

type FormatVersion = { id: string; key: string; label: string; isWork: boolean; score: number | null; active: boolean; effectiveFrom: string }

export function FormatsTab() {
  const qc = useQueryClient()
  const { data: versions = [], isLoading } = useQuery<FormatVersion[]>({
    queryKey: ['day-format-versions'],
    queryFn: () => api.get('/day-entries/formats/versions').then(r => r.data),
  })
  // актуальная версия каждого ключа (versions отсортированы по key, effectiveFrom desc); снятые скрываем
  const current = new Map<string, FormatVersion>()
  for (const v of versions) if (!current.has(v.key)) current.set(v.key, v)
  const rows = [...current.values()].filter(v => v.active !== false)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['day-format-versions'] })
    qc.invalidateQueries({ queryKey: ['day-formats'] })
  }
  const onErr = (err: unknown) => toast((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Ошибка', 'info')
  const { confirm, confirmUI } = useConfirm()

  // ── правка существующего формата ──
  const [editing, setEditing] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [isWork, setIsWork] = useState(true)
  const [score, setScore] = useState('')
  const save = useMutation({
    mutationFn: (key: string) => api.post('/day-entries/formats', { key, label: label.trim(), isWork, score: score === '' ? null : Number(score) }),
    onSuccess: () => { setEditing(null); invalidate() },
    onError: onErr,
  })
  const startEdit = (v: FormatVersion) => { setEditing(v.key); setLabel(v.label); setIsWork(v.isWork); setScore(v.score == null ? '' : String(v.score)) }

  // ── добавление нового формата ──
  const [adding, setAdding] = useState(false)
  const [nKey, setNKey] = useState('')
  const [nLabel, setNLabel] = useState('')
  const [nWork, setNWork] = useState(true)
  const [nScore, setNScore] = useState('')
  const keyValid = /^[a-z_]+$/.test(nKey.trim()) && !current.has(nKey.trim())
  const add = useMutation({
    mutationFn: () => api.post('/day-entries/formats', { key: nKey.trim(), label: nLabel.trim(), isWork: nWork, score: nScore === '' ? null : Number(nScore) }),
    onSuccess: () => { setAdding(false); setNKey(''); setNLabel(''); setNWork(true); setNScore(''); invalidate() },
    onError: onErr,
  })

  // ── удаление формата (умное: не используется → удалить; используется → снять) ──
  const del = useMutation({
    mutationFn: (key: string) => api.delete(`/day-entries/formats/${key}`),
    onSuccess: (res: { data: { retired?: boolean; usedBy?: number } }) => {
      invalidate()
      if (res.data?.retired) toast(`Формат снят с использования (записей с ним: ${res.data.usedBy}). История сохранена.`, 'info')
    },
    onError: onErr,
  })
  const onDelete = (v: FormatVersion) => {
    confirm({ message: `Удалить формат «${v.label}»? Если он уже проставлен в чьих-то днях — будет снят с использования (история сохранится).`, confirmLabel: 'Удалить', danger: true }).then(ok => ok && del.mutate(v.key))
  }

  const th: React.CSSProperties = { padding: '8px 12px', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left', borderBottom: '1px solid var(--border)' }
  const td: React.CSSProperties = { padding: '8px 12px', fontSize: 14, color: 'var(--text-1)', borderBottom: '1px solid var(--border)' }
  const inp: React.CSSProperties = { background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 8px', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 14, outline: 'none' }
  const btnPrimary: React.CSSProperties = { padding: '5px 14px', borderRadius: 7, border: 'none', background: 'var(--primary, #4f46e5)', color: '#fff', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' }
  const btnGhost: React.CSSProperties = { padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'none', color: 'var(--text-3)', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }

  return (
    <div style={{ maxWidth: 820 }}>
      <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Форматы дня</h2>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
        Изменения версионируются и действуют <b>с 1-го числа текущего месяца</b>; прошлые периоды считаются по прежним весам.
        Удаление использованного формата = снятие с использования (история цела).
      </p>
      {isLoading ? <div style={{ color: 'var(--text-muted)' }}>Загрузка…</div> : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface-2)' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>
              <th style={th}>Формат</th><th style={th}>Ключ</th><th style={th}>Рабочий</th>
              <th style={{ ...th, textAlign: 'right' }}>Балл</th>
              <th style={th}>Действует с</th><th style={{ ...th, textAlign: 'right' }} />
            </tr></thead>
            <tbody>
              {rows.map(v => (
                <tr key={v.key}>
                  <td style={td}>
                    {editing === v.key
                      ? <input value={label} onChange={e => setLabel(e.target.value)} style={{ ...inp, width: 160 }} />
                      : v.label}
                  </td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 12, color: 'var(--text-3)' }}>{v.key}</td>
                  <td style={td}>
                    {editing === v.key
                      ? <input type="checkbox" checked={isWork} onChange={e => setIsWork(e.target.checked)} />
                      : (v.isWork ? 'да' : 'нет')}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>
                    {editing === v.key
                      ? <input type="number" step={0.05} min={0} value={score} onChange={e => setScore(e.target.value)} placeholder="—" style={{ ...inp, width: 70, textAlign: 'right' }} />
                      : (v.score == null ? '—' : v.score)}
                  </td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 12, color: 'var(--text-3)' }}>{v.effectiveFrom.slice(0, 10)}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {editing === v.key ? (
                      <>
                        <button onClick={() => save.mutate(v.key)} disabled={save.isPending || !label.trim()} style={{ ...btnPrimary, marginRight: 6 }}>
                          {save.isPending ? '…' : 'Сохранить'}
                        </button>
                        <button onClick={() => setEditing(null)} style={btnGhost}>Отмена</button>
                      </>
                    ) : (
                      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <button onClick={() => startEdit(v)} style={{ ...btnGhost, color: 'var(--text-2)' }}>Изменить</button>
                        <button onClick={() => onDelete(v)} disabled={del.isPending} title="Удалить формат" style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'none', color: 'var(--danger, #e8194b)', cursor: 'pointer', display: 'inline-flex' }}>
                          <Trash2 size={14} />
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Добавление формата */}
          <div style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
            {adding ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input value={nKey} onChange={e => setNKey(e.target.value)} placeholder="ключ (a-z_)" style={{ ...inp, width: 130, fontFamily: 'monospace' }} />
                <input value={nLabel} onChange={e => setNLabel(e.target.value)} placeholder="Название" style={{ ...inp, width: 170 }} />
                <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <input type="checkbox" checked={nWork} onChange={e => setNWork(e.target.checked)} /> рабочий
                </label>
                <input type="number" step={0.05} min={0} value={nScore} onChange={e => setNScore(e.target.value)} placeholder="балл" style={{ ...inp, width: 80, textAlign: 'right' }} />
                <button onClick={() => add.mutate()} disabled={add.isPending || !keyValid || !nLabel.trim()} style={btnPrimary}>{add.isPending ? '…' : 'Добавить'}</button>
                <button onClick={() => { setAdding(false); setNKey('') }} style={btnGhost}>Отмена</button>
                {nKey.trim() && !keyValid && <span style={{ fontSize: 12, color: 'var(--danger, #e8194b)' }}>ключ: строчная латиница и «_», уникальный</span>}
              </div>
            ) : (
              <button onClick={() => setAdding(true)} style={{ ...btnGhost, color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Plus size={14} /> Добавить формат
              </button>
            )}
          </div>
        </div>
      )}
      {confirmUI}
    </div>
  )
}

// ── Роли и доступы: гранты модулей департаментам (RBAC-MODEL §5.3) ────────────

type RegistryModule = { key: string; name: string; group: string; readonly: boolean }
type DeptGrants = { id: string; name: string; employeeCount: number; grants: Array<{ moduleKey: string; editLevel: string }> }

// Короткое описание модуля — что даёт и где проявляется (спека RBAC-REDESIGN §3).
const MODULE_DESC: Record<string, string> = {
  'com.projects':          'Правка проектов в реестре (страница «Проекты»).',
  'prod.workitems':        'Создание и правка Work Items (заявок) внутри проектов.',
  'fin.budgets':           'Правка бюджета Work Item.',
  'fin.expenses':          'Правка расходов Work Item.',
  'fin.company-finance':   'Просмотр агрегированных финансов проектов.',
  'hr.orgstructure':       'Правка оргструктуры и графиков работы; доступ к данным персонала.',
  'hr.absences':           'Занесение HR-статусов (отпуск/больничный/отгул) и форматов дня.',
  'adm.calendar-global':   'Запись событий в общий/публичный календарь (Знаменка и пр.).',
  'adm.analytics-company': 'Аналитика в разрезе всей компании (а не только своего отдела).',
  'adm.news':              'Публикация новостей в ленту Пульса.',
  'ext.inventory':         'Переход во внешний сервис «Инвентаризация».',
}

// Порядок областей (групп) в матрице
const GROUP_ORDER = ['Проекты', 'HR', 'Календарь', 'Аналитика', 'Пульс', 'Внешние']

export function RolesTab() {
  const qc = useQueryClient()
  const { data: registry = [] } = useQuery<RegistryModule[]>({
    queryKey: ['access-registry'],
    queryFn: () => api.get('/access/registry').then(r => r.data),
    staleTime: Infinity,
  })
  const { data: depts = [], isLoading } = useQuery<DeptGrants[]>({
    queryKey: ['access-grants'],
    queryFn: () => api.get('/access/grants').then(r => r.data),
  })

  const setGrant = useMutation({
    mutationFn: (p: { deptId: string; moduleKey: string; editLevel: string | null }) => api.put('/access/grants', p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['access-grants'] }),
    onError: (err: unknown) => toast((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Ошибка', 'info'),
  })

  const [selId, setSelId] = useState<string | null>(null)
  const selected = depts.find(d => d.id === selId) ?? depts[0] ?? null

  // Области в порядке GROUP_ORDER; неизвестные группы — в конце
  const groups = [...new Set(registry.map(m => m.group))].sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a), ib = GROUP_ORDER.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })

  return (
    <div>
      <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Роли и доступы</h2>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5, maxWidth: 680 }}>
        Модуль выдаётся <b>департаменту</b>; уровень определяет, с какой ступени иерархии доступно редактирование
        (ниже — только просмотр). Уровень человека выводится из оргструктуры: сотрудник → руководитель отдела → директор департамента.
      </p>
      {isLoading ? <div style={{ color: 'var(--text-muted)' }}>Загрузка…</div> : (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* Слева — департаменты (переключатель) */}
          <div style={{ width: 236, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {depts.map(d => {
              const sel = selected?.id === d.id
              return (
                <button key={d.id} onClick={() => setSelId(d.id)}
                  style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                    background: sel ? 'var(--surface-3)' : 'transparent',
                    border: `1px solid ${sel ? 'var(--border)' : 'transparent'}`,
                    display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: sel ? 700 : 500, color: sel ? 'var(--text-1)' : 'var(--text-2)' }}>{d.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{d.employeeCount} чел · {d.grants.length} модулей</span>
                </button>
              )
            })}
          </div>

          {/* Справа — матрица выбранного департамента, секции по областям */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {!selected ? <div style={{ color: 'var(--text-muted)' }}>Нет департаментов</div> : groups.map(g => {
              const mods = registry.filter(m => m.group === g)
              if (!mods.length) return null
              return (
                <div key={g}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', marginBottom: 8 }}>{g}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 8 }}>
                    {mods.map(m => {
                      const grant = selected.grants.find(x => x.moduleKey === m.key)
                      return (
                        <div key={m.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', borderRadius: 10,
                          background: grant ? 'var(--surface-3)' : 'var(--surface-2)', border: '1px solid var(--border)' }}>
                          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, flex: 1, minWidth: 0, cursor: 'pointer' }}>
                            <input type="checkbox" checked={!!grant} style={{ marginTop: 2, cursor: 'pointer', flexShrink: 0 }}
                              onChange={e => setGrant.mutate({ deptId: selected.id, moduleKey: m.key, editLevel: e.target.checked ? 'member' : null })} />
                            <span style={{ minWidth: 0 }}>
                              <span style={{ display: 'block', fontSize: 13, fontWeight: grant ? 600 : 500, color: grant ? 'var(--text-1)' : 'var(--text-2)' }}>{m.name}</span>
                              {MODULE_DESC[m.key] && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>{MODULE_DESC[m.key]}</span>}
                            </span>
                          </label>
                          <div style={{ flexShrink: 0, marginTop: 1 }}>
                            {grant && !m.readonly && (
                              <select value={grant.editLevel}
                                onChange={e => setGrant.mutate({ deptId: selected.id, moduleKey: m.key, editLevel: e.target.value })}
                                style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: 12 }}>
                                <option value="member">сотрудник+</option>
                                <option value="head">руковод.+</option>
                                <option value="director">директор</option>
                              </select>
                            )}
                            {grant && m.readonly && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>просмотр</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}