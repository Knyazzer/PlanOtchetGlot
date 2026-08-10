import { DashboardPage } from './DashboardPage'
import { TasksPage } from './TasksPage'
import { RequestsPage } from './RequestsPage'

type OpenChatWith = (userId: string, task: { id: string; title: string; assigneeId: string; assignedById: string }, isSelf: boolean) => void
type CabTab = 'overview' | 'tasks' | 'tracks' | 'requests'

// «Мой кабинет» — контейнер личной работы сотрудника с внутренними вкладками:
//   Обзор — рабочий стол (статус, план дня, задачи/дедлайны/события);
//   Задачи — доска/таблица/гант; Треки — этапы+задачи.
// Вкладка (tab) управляется из левого меню — «Мой кабинет» раскрывается под-пунктами
// (Обзор/Задачи/Треки); свой переключатель в шапке CabinetPage больше НЕ рисует.
export function CabinetPage({ tab, onOpenChatWith, onOpenTrackChat, onOpenGanttTask, tasksDeepLink, onTasksDeepLinkConsumed }: {
  tab: CabTab
  onOpenChatWith: OpenChatWith
  onOpenTrackChat?: (chatId: string) => void
  /** Инфопанель дедлайнов (Обзор) → переход во вкладку «Задачи» в Гант, опц. с открытой задачей. */
  onOpenGanttTask?: (taskId?: string) => void
  tasksDeepLink?: { taskId?: string } | null
  onTasksDeepLinkConsumed?: () => void
}) {
  return (
    <>
      {tab === 'overview' && <DashboardPage onOpenGanttTask={onOpenGanttTask} />}
      {tab === 'tasks'    && <TasksPage externalTab="tasks"  onOpenChatWith={onOpenChatWith} onOpenTrackChat={onOpenTrackChat} deepLink={tasksDeepLink} onDeepLinkConsumed={onTasksDeepLinkConsumed} />}
      {tab === 'tracks'   && <TasksPage externalTab="tracks" onOpenChatWith={onOpenChatWith} onOpenTrackChat={onOpenTrackChat} />}
      {tab === 'requests' && <RequestsPage />}
    </>
  )
}
