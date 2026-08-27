import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatName } from '../../lib/utils'
import type { WorkItem, UserRef } from './types'
import { LoadingState } from './ui'

// ── TeamTab ───────────────────────────────────────────────────────────────────

export function TeamTab({ projectId }: { projectId: string }) {
  const { data: workItems = [], isLoading } = useQuery<WorkItem[]>({
    queryKey: ['work-items', projectId],
    queryFn:  () => api.get(`/projects/${projectId}/work-items`).then(r => r.data),
  })

  if (isLoading) return <LoadingState />

  // Собираем уникальных людей из ролей WI
  type PersonEntry = { name: string; role: string; wis: string[] }
  const people = new Map<string, PersonEntry>()

  workItems.forEach(wi => {
    const roles: [UserRef | undefined, string][] = [
      [wi.execProducer, 'Исп. продюсер'],
      [wi.lineProducer, 'Лайн продюсер'],
      [wi.accountManager, 'Аккаунт менеджер'],
    ]
    roles.forEach(([user, role]) => {
      if (!user) return
      const key = `${user.id}-${role}`
      if (!people.has(key)) people.set(key, { name: user.name, role, wis: [] })
      people.get(key)!.wis.push(wi.title)
    })
  })

  // Группируем по отделам из WI
  const deptMap = new Map<string, { name: string; color: string; members: Set<string> }>()
  workItems.forEach(wi => {
    wi.departments.forEach(d => {
      const key = d.division.department.id
      if (!deptMap.has(key)) deptMap.set(key, { name: d.division.department.name, color: d.division.department.color, members: new Set() })
      deptMap.get(key)!.members.add(d.division.name)
    })
  })

  const peopleList = [...people.values()]

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Roles */}
      {peopleList.length > 0 && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
            Ключевые роли
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            {peopleList.map((p, i) => (
              <div key={i} style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', borderRight: i % 2 === 0 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 4 }}>{p.role}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{formatName(p.name)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{p.wis.length} WI</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Departments */}
      {deptMap.size > 0 && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
            Отделы на проекте
          </div>
          {[...deptMap.values()].map((dept, i, arr) => (
            <div key={dept.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ width: 28, height: 28, borderRadius: 7, background: `${dept.color}22`, color: dept.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                {dept.name.slice(0, 2).toUpperCase()}
              </span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{dept.name}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{[...dept.members].join(', ')}</span>
            </div>
          ))}
        </div>
      )}

      {peopleList.length === 0 && deptMap.size === 0 && (
        <div style={{ padding: 48, textAlign: 'center', fontSize: 14, color: 'var(--text-muted)' }}>
          Добавьте роли и отделы в Work Items
        </div>
      )}
    </div>
  )
}