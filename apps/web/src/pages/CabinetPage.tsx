import { DashboardPage } from './DashboardPage'
import { TasksPage } from './TasksPage'

type OpenChatWith = (userId: string, task: { id: string; title: string; assigneeId: string; assignedById: string }, isSelf: boolean) => void
type CabTab = 'overview' | 'tasks' | 'tracks'

// «Мой кабинет» — контейнер личной работы сотрудника с внутренними вкладками:
//   Обзор — рабочий стол (статус, план дня, задачи/дедлайны/события);
//   Задачи — доска/таблица/гант; Треки — этапы+задачи.
// Вкладка (tab) управляется из левого меню — «Мой кабинет» раскрывается под-пунктами
// (Обзор/Задачи/Треки); свой переключатель в шапке CabinetPage больше НЕ рисует.
export function CabinetPage({ tab, onOpenChatWith, onOpenTrackChat }: {
  tab: CabTab
  onOpenChatWith: OpenChatWith
  onOpenTrackChat?: (chatId: string) => void
}) {
  return (
    <>
      {tab === 'overview' && <DashboardPage />}
      {tab === 'tasks'    && <TasksPage externalTab="tasks"  onOpenChatWith={onOpenChatWith} onOpenTrackChat={onOpenTrackChat} />}
      {tab === 'tracks'   && <TasksPage externalTab="tracks" onOpenChatWith={onOpenChatWith} onOpenTrackChat={onOpenTrackChat} />}
    </>
  )
}
