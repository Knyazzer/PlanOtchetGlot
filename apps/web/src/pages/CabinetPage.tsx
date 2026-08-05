import { useState } from 'react'
import { HeaderPortal } from '../components/HeaderPortal'
import { DashboardPage } from './DashboardPage'
import { TasksPage } from './TasksPage'

type OpenChatWith = (userId: string, task: { id: string; title: string; assigneeId: string; assignedById: string }, isSelf: boolean) => void
type CabTab = 'overview' | 'tasks' | 'tracks'

// «Мой кабинет» — контейнер личной работы сотрудника с внутренними вкладками:
//   Обзор — рабочий стол (статус, план дня, задачи/дедлайны/события);
//   Задачи — доска/таблица/гант; Треки — этапы+задачи.
// Задачи/Треки — тот же TasksPage с externalTab (свой переключатель он не рисует).
// Переключатель — в китовой шапке (портал рендерится первым → слева от контролов страницы).
export function CabinetPage({ onOpenChatWith }: { onOpenChatWith: OpenChatWith }) {
  const [tab, setTab] = useState<CabTab>(() => {
    const s = localStorage.getItem('nexus:cabinet-tab')
    return s === 'tasks' || s === 'tracks' ? s : 'overview'
  })
  const pick = (t: CabTab) => { setTab(t); localStorage.setItem('nexus:cabinet-tab', t) }
  const tabs: [CabTab, string][] = [['overview', 'Обзор'], ['tasks', 'Задачи'], ['tracks', 'Треки']]
  return (
    <>
      <HeaderPortal>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--surface-2)', borderRadius: 8, padding: 3 }}>
          {tabs.map(([v, label]) => (
            <button key={v} onClick={() => pick(v)}
              style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: tab === v ? 'var(--surface)' : 'none', color: tab === v ? 'var(--accent-s)' : 'var(--text-3)', fontFamily: 'Inter,sans-serif', fontSize: 14, fontWeight: tab === v ? 700 : 500, cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>
      </HeaderPortal>
      {tab === 'overview' && <DashboardPage />}
      {tab === 'tasks'    && <TasksPage externalTab="tasks"  onOpenChatWith={onOpenChatWith} />}
      {tab === 'tracks'   && <TasksPage externalTab="tracks" onOpenChatWith={onOpenChatWith} />}
    </>
  )
}
