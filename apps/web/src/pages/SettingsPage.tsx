import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Calendar, Shield, Database, RefreshCw } from 'lucide-react'
import { api } from '../lib/api'
import { useCurrentUser } from '../hooks/useAuth'

// Настройки (только для администратора).
// Живые вкладки: «Форматы дня» (версионируемый справочник, Q-DAY-5)
// и «Роли и доступы» (гранты DepartmentModule, RBAC-MODEL §5.3).
// Профиль/тема/статус/пароль — в панели профиля (клик по имени в сайдбаре).

type Tab = 'structure' | 'formats' | 'roles' | 'backups' | 'sync'

export function SettingsPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const user = useCurrentUser()
  const isAdmin = !!user?.isAdmin
  const [tab, setTab] = useState<Tab>('formats')

  const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'structure', label: 'Структура',      icon: Building2 },
    { id: 'formats',   label: 'Форматы дня',    icon: Calendar  },
    { id: 'roles',     label: 'Роли и доступы', icon: Shield    },
    { id: 'backups',   label: 'Бэкапы',         icon: Database  },
    { id: 'sync',      label: 'Синхронизация',  icon: RefreshCw },
  ]
  const visibleTabs = TABS

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Tabs rail */}
      <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--border)', padding: '20px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <h1 style={{ margin: '0 8px 14px', fontSize: 18, fontWeight: 800, color: 'var(--text-1)' }}>Настройки</h1>
        {visibleTabs.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 9, width: '100%',
              padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: tab === t.id ? 'var(--surface-2)' : 'transparent',
              color: tab === t.id ? 'var(--text-1)' : 'var(--text-3)',
              fontFamily: 'inherit', fontSize: 13, fontWeight: tab === t.id ? 600 : 400, textAlign: 'left',
            }}>
              <Icon size={15} style={{ flexShrink: 0 }} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        {tab === 'structure' && isAdmin && (
          <Placeholder
            title="Структура компании"
            text="Департаменты, отделы и членство управляются на странице «Персонал» (вкладка «Структура»)."
            action={onNavigate ? { label: 'Открыть Персонал', onClick: () => onNavigate('personnel') } : undefined}
          />
        )}
        {tab === 'formats' && isAdmin && <FormatsTab />}
        {tab === 'roles' && isAdmin && <RolesTab />}
        {tab === 'backups' && isAdmin && (
          <Placeholder
            title="Бэкапы"
            text="Резервные копии PostgreSQL выполняются на VDS по расписанию (см. docs/DEPLOY-RUNBOOK.md). Управление из интерфейса — в плане."
          />
        )}
        {tab === 'sync' && isAdmin && (
          <Placeholder
            title="Синхронизация Google Sheets"
            text="Конфигурация листов и ручное обновление кэша — на странице «База данных»."
            action={onNavigate ? { label: 'Открыть Базу данных', onClick: () => onNavigate('database') } : undefined}
          />
        )}
      </div>
    </div>
  )
}

function Placeholder({ title, text, action }: { title: string; text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div style={{ maxWidth: 520 }}>
      <h2 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>{title}</h2>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5 }}>{text}</p>
      {action && (
        <button onClick={action.onClick} style={{ marginTop: 14, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer' }}>
          {action.label}
        </button>
      )}
    </div>
  )
}

// ── Форматы дня: правка → новая версия с текущего периода (Q-DAY-5) ───────────

type FormatVersion = { id: string; key: string; label: string; isWork: boolean; score: number | null; effectiveFrom: string }

function FormatsTab() {
  const qc = useQueryClient()
  const { data: versions = [], isLoading } = useQuery<FormatVersion[]>({
    queryKey: ['day-format-versions'],
    queryFn: () => api.get('/day-entries/formats/versions').then(r => r.data),
  })
  // актуальная версия каждого ключа (versions отсортированы по key, effectiveFrom desc)
  const current = new Map<string, FormatVersion>()
  for (const v of versions) if (!current.has(v.key)) current.set(v.key, v)

  const [editing, setEditing] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [isWork, setIsWork] = useState(true)
  const [score, setScore] = useState('')

  const save = useMutation({
    mutationFn: (key: string) => api.post('/day-entries/formats', {
      key, label: label.trim(), isWork, score: score === '' ? null : Number(score),
    }),
    onSuccess: () => {
      setEditing(null)
      qc.invalidateQueries({ queryKey: ['day-format-versions'] })
      qc.invalidateQueries({ queryKey: ['day-formats'] })
    },
    onError: (err: unknown) => alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Ошибка'),
  })

  const startEdit = (v: FormatVersion) => {
    setEditing(v.key)
    setLabel(v.label)
    setIsWork(v.isWork)
    setScore(v.score == null ? '' : String(v.score))
  }

  const th: React.CSSProperties = { padding: '8px 12px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left', borderBottom: '1px solid var(--border)' }
  const td: React.CSSProperties = { padding: '8px 12px', fontSize: 13, color: 'var(--text-1)', borderBottom: '1px solid var(--border)' }
  const inp: React.CSSProperties = { background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 8px', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 13, outline: 'none' }

  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Форматы дня</h2>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
        Изменения версионируются и действуют <b>с 1-го числа текущего месяца</b>; прошлые периоды считаются по прежним весам.
      </p>
      {isLoading ? <div style={{ color: 'var(--text-muted)' }}>Загрузка…</div> : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface-2)' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>
              <th style={th}>Формат</th><th style={th}>Ключ</th><th style={th}>Рабочий</th>
              <th style={{ ...th, textAlign: 'right' }}>Балл</th>
              <th style={th}>Действует с</th><th style={th} />
            </tr></thead>
            <tbody>
              {[...current.values()].map(v => (
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
                        <button onClick={() => save.mutate(v.key)} disabled={save.isPending || !label.trim()} style={{ padding: '4px 12px', borderRadius: 7, border: 'none', background: 'var(--primary, #4f46e5)', color: '#fff', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginRight: 6 }}>
                          {save.isPending ? '…' : 'Сохранить'}
                        </button>
                        <button onClick={() => setEditing(null)} style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'none', color: 'var(--text-3)', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}>Отмена</button>
                      </>
                    ) : (
                      <button onClick={() => startEdit(v)} style={{ padding: '4px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'none', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}>Изменить</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Роли и доступы: гранты модулей департаментам (RBAC-MODEL §5.3) ────────────

type RegistryModule = { key: string; name: string; group: string; readonly: boolean }
type DeptGrants = { id: string; name: string; employeeCount: number; grants: Array<{ moduleKey: string; editLevel: string }> }

function RolesTab() {
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
    onError: (err: unknown) => alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Ошибка'),
  })

  const groups = [...new Set(registry.map(m => m.group))]

  return (
    <div>
      <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Роли и доступы</h2>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5, maxWidth: 680 }}>
        Модуль выдаётся <b>департаменту</b>; уровень определяет, с какой ступени иерархии доступно редактирование
        (ниже — только просмотр). Уровень человека выводится из оргструктуры: сотрудник → руководитель отдела → директор департамента.
      </p>
      {isLoading ? <div style={{ color: 'var(--text-muted)' }}>Загрузка…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {depts.map(d => (
            <div key={d.id} style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface-2)', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{d.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{d.employeeCount} чел · {d.grants.length} модулей</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
                {groups.map(g => registry.filter(m => m.group === g).map(m => {
                  const grant = d.grants.find(x => x.moduleKey === m.key)
                  return (
                    <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: grant ? 'var(--surface-3)' : 'transparent', border: `1px solid ${grant ? 'var(--border)' : 'transparent'}` }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, cursor: 'pointer', fontSize: 12, color: grant ? 'var(--text-1)' : 'var(--text-muted)' }}>
                        <input
                          type="checkbox"
                          checked={!!grant}
                          onChange={e => setGrant.mutate({ deptId: d.id, moduleKey: m.key, editLevel: e.target.checked ? 'member' : null })}
                        />
                        <span title={`${m.group} · ${m.key}`}>{m.name}</span>
                      </label>
                      {grant && !m.readonly && (
                        <select
                          value={grant.editLevel}
                          onChange={e => setGrant.mutate({ deptId: d.id, moduleKey: m.key, editLevel: e.target.value })}
                          style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: 11 }}
                        >
                          <option value="member">сотрудник+</option>
                          <option value="head">руковод.+</option>
                          <option value="director">директор</option>
                        </select>
                      )}
                      {grant && m.readonly && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>просмотр</span>}
                    </div>
                  )
                }))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
