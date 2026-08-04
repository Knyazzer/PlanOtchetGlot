import { useState } from 'react'
import { HeaderPortal } from '../components/HeaderPortal'
import { DashboardPage } from './DashboardPage'
import { TasksPage } from './TasksPage'

type OpenChatWith = (userId: string, task: { id: string; title: string; assigneeId: string; assignedById: string }, isSelf: boolean) => void

// «Мой кабинет» — контейнер личной работы сотрудника с внутренними вкладками:
//   Обзор — рабочий стол (статус, план дня, задачи/дедлайны/события);
//   Задачи — полный TasksPage (Доска/Таблица/Гант + внутренние Задачи/Треки).
// Переключатель — в китовой шапке (портал рендерится первым → слева от контролов страницы).
export function CabinetPage({ onOpenChatWith }: { onOpenChatWith: OpenChatWith }) {
  const [tab, setTab] = useState<'overview' | 'tasks'>(() => (localStorage.getItem('nexus:cabinet-tab') === 'tasks' ? 'tasks' : 'overview'))
  const pick = (t: 'overview' | 'tasks') => { setTab(t); localStorage.setItem('nexus:cabinet-tab', t) }
  return (
    <>
      <HeaderPortal>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--surface-2)', borderRadius: 8, padding: 3 }}>
          {(['overview', 'tasks'] as const).map(v => (
            <button key={v} onClick={() => pick(v)}
              style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: tab === v ? 'var(--surface)' : 'none', color: tab === v ? 'var(--accent-s)' : 'var(--text-3)', fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: tab === v ? 700 : 500, cursor: 'pointer' }}>
              {v === 'overview' ? 'Обзор' : 'Задачи'}
            </button>
          ))}
        </div>
      </HeaderPortal>
      {tab === 'tasks' ? <TasksPage onOpenChatWith={onOpenChatWith} /> : <DashboardPage />}
    </>
  )
}
