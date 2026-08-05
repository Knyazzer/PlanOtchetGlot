import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Users, Calendar, List as ListIcon } from 'lucide-react'
import { api } from '../lib/api'
import { FormatsTab } from './SettingsPage'

// «Списки» — единые справочники для всех. Админ настраивает значения, формы сотрудников читают.
// Спец-вкладки: Клиенты (модель Client, FK-защита), Форматы дня (версионный редактор).
// Остальные — универсальные списки-значения (RefList/RefItem).

type RefList = { key: string; label: string; sortOrder: number; items: Array<{ id: string; value: string }> }

const CLIENTS = '__clients'
const DAYFORMATS = '__dayformats'

const railBtn = (active: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 9, width: '100%',
  padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
  background: active ? 'var(--surface-2)' : 'transparent',
  color: active ? 'var(--text-1)' : 'var(--text-3)',
  fontFamily: 'inherit', fontSize: 14, fontWeight: active ? 600 : 400, textAlign: 'left',
})

export function ListsPage() {
  const { data: lists = [] } = useQuery<RefList[]>({
    queryKey: ['refs'],
    queryFn: () => api.get('/refs').then(r => r.data),
  })
  const [tab, setTab] = useState<string>(CLIENTS)

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Tabs rail */}
      <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid var(--border)', padding: '20px 12px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        <h1 style={{ margin: '0 8px 14px', fontSize: 22, fontWeight: 800, color: 'var(--text-1)' }}>Списки</h1>
        <button onClick={() => setTab(CLIENTS)} style={railBtn(tab === CLIENTS)}><Users size={15} style={{ flexShrink: 0 }} />Клиенты</button>
        <button onClick={() => setTab(DAYFORMATS)} style={railBtn(tab === DAYFORMATS)}><Calendar size={15} style={{ flexShrink: 0 }} />Форматы дня</button>
        <div style={{ height: 1, background: 'var(--border)', margin: '8px 4px' }} />
        {lists.map(l => (
          <button key={l.key} onClick={() => setTab(l.key)} style={railBtn(tab === l.key)}>
            <ListIcon size={15} style={{ flexShrink: 0 }} />{l.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        {tab === CLIENTS && <ClientsTab />}
        {tab === DAYFORMATS && <FormatsTab />}
        {tab !== CLIENTS && tab !== DAYFORMATS && <RefListTab listKey={tab} label={lists.find(l => l.key === tab)?.label ?? tab} />}
      </div>
    </div>
  )
}

// ── Общий список-значения (RefItem) ──────────────────────────────────────────
function RefListTab({ listKey, label }: { listKey: string; label: string }) {
  const qc = useQueryClient()
  const { data: lists = [] } = useQuery<RefList[]>({ queryKey: ['refs'], queryFn: () => api.get('/refs').then(r => r.data) })
  const list = lists.find(l => l.key === listKey)
  const [value, setValue] = useState('')

  const onErr = (err: unknown) => alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Ошибка')
  const add = useMutation({
    mutationFn: () => api.post(`/refs/${listKey}/items`, { value: value.trim() }),
    onSuccess: () => { setValue(''); qc.invalidateQueries({ queryKey: ['refs'] }) },
    onError: onErr,
  })
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/refs/items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['refs'] }),
    onError: onErr,
  })

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>{label}</h2>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-3)' }}>
        Единый список для всех. Значения доступны для выбора в формах сотрудников.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          value={value} onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && value.trim()) add.mutate() }}
          placeholder="Новое значение"
          style={{ flex: 1, background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 14, outline: 'none' }}
        />
        <button onClick={() => add.mutate()} disabled={add.isPending || !value.trim()} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--primary, #4f46e5)', color: '#fff', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} /> Добавить
        </button>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface-2)' }}>
        {!list || list.items.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>Список пуст — добавьте значения</div>
        ) : list.items.map(it => (
          <div key={it.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 14, color: 'var(--text-1)' }}>{it.value}</span>
            <button onClick={() => del.mutate(it.id)} disabled={del.isPending} title="Удалить" style={{ padding: '4px 7px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--danger, #e8194b)', cursor: 'pointer', display: 'inline-flex' }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Клиенты (модель Client, защита по проектам) ──────────────────────────────
type Client = { id: string; name: string }
function ClientsTab() {
  const qc = useQueryClient()
  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ['clients'], queryFn: () => api.get('/clients').then(r => r.data) })
  const [name, setName] = useState('')

  const onErr = (err: unknown) => alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Ошибка')
  const add = useMutation({
    mutationFn: () => api.post('/clients', { name: name.trim() }),
    onSuccess: () => { setName(''); qc.invalidateQueries({ queryKey: ['clients'] }) },
    onError: onErr,
  })
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/clients/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
    onError: onErr,
  })

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Клиенты</h2>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-3)' }}>
        Используются в проектах. Клиента с проектами удалить нельзя.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) add.mutate() }}
          placeholder="Название клиента"
          style={{ flex: 1, background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 14, outline: 'none' }}
        />
        <button onClick={() => add.mutate()} disabled={add.isPending || !name.trim()} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--primary, #4f46e5)', color: '#fff', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} /> Добавить
        </button>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface-2)' }}>
        {clients.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>Клиентов нет</div>
        ) : clients.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 14, color: 'var(--text-1)' }}>{c.name}</span>
            <button onClick={() => { if (window.confirm(`Удалить клиента «${c.name}»?`)) del.mutate(c.id) }} disabled={del.isPending} title="Удалить" style={{ padding: '4px 7px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--danger, #e8194b)', cursor: 'pointer', display: 'inline-flex' }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
