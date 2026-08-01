import type { CatDef, EventType, EntryType, ModalState, EntryModalState } from './types'

// ── Category config ────────────────────────────────────────────────────────
export const TYPE_COLOR: Record<string, string> = {
  meeting:             '#8B5CF6',
  task:                '#FF6B35',
  personal:            '#29BF12',
  global:              '#0EA5E9',
  znamenka_kaminoka:   '#F59E0B',
  znamenka_chernaya:   '#6B7280',
  znamenka_kupol:      '#A855F7',
  hr_sick:             '#E8194B',
  hr_vacation:         '#0EA5E9',
  hr_unpaid:           '#F59E0B',
  hr_dayoff:           '#29BF12',
}

// Toggleable categories (global always visible, not in this list for non-admins)
export const MY_CATS: CatDef[]  = [{ id: 'my_events', label: 'Мои события', color: '#8B5CF6' }]
export const HR_CATS: CatDef[]  = [
  { id: 'hr_sick',    label: 'Больничный',           color: '#E8194B' },
  { id: 'hr_vacation',label: 'Отпуск',               color: '#0EA5E9' },
  { id: 'hr_unpaid',  label: 'Отпуск за свой счёт',  color: '#F59E0B' },
  { id: 'hr_dayoff',  label: 'Отгул',                color: '#29BF12' },
]

export const LOCATIONS = [
  { id: 'kaminoka', label: 'Знаменка Каминка' },
  { id: 'chernaya', label: 'Знаменка Чёрная'  },
  { id: 'kupol',    label: 'Знаменка Купол'   },
  { id: 'zoom',     label: 'Zoom'              },
  { id: 'office',   label: 'Офис'             },
  { id: 'vyezd',    label: 'Выезд'            },
]
export const LOCATION_IDS = new Set(LOCATIONS.map(l => l.id))

export const MY_EVENT_TYPES = [
  { value: 'meeting' as EventType, label: 'Встреча' },
  { value: 'task'    as EventType, label: 'Задача'  },
  { value: 'personal'as EventType, label: 'Личное'  },
]

export const SHARED_ENTRY_TYPES: { value: EntryType; label: string }[] = [
  { value: 'global',            label: 'Общий'              },
  { value: 'znamenka_kaminoka', label: 'Знаменка Каминка'   },
  { value: 'znamenka_chernaya', label: 'Знаменка Чёрная'    },
  { value: 'znamenka_kupol',    label: 'Знаменка Купол'     },
]

export const HR_ENTRY_TYPES: { value: EntryType; label: string }[] = [
  { value: 'hr_sick',     label: 'Больничный'          },
  { value: 'hr_vacation', label: 'Отпуск'              },
  { value: 'hr_unpaid',   label: 'Отпуск за свой счёт' },
  { value: 'hr_dayoff',   label: 'Отгул'               },
]

// ── Locale helpers ─────────────────────────────────────────────────────────
export const MONTHS_RU     = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
export const MONTHS_RU_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']
export const WEEKDAYS_S    = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']
export const WEEKDAYS_F    = ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье']

// ── Shared ─────────────────────────────────────────────────────────────────
export const navBtnStyle: React.CSSProperties = {
  width:32, height:32, borderRadius:8, border:'1px solid var(--border)',
  background:'none', color:'var(--text-3)', fontSize:16, cursor:'pointer',
  display:'flex', alignItems:'center', justifyContent:'center',
}

export const BLANK_MODAL = (): ModalState => ({
  open: false, editId: null, source: 'event',
  type: 'meeting', date: '', start: '09:00', end: '10:00', title: '',
  location: [], vyezdAddress: '', participantIds: [], canEdit: true,
})
export const BLANK_ENTRY = (): EntryModalState => ({
  open: false, editId: null,
  type: 'global', date: '', start: '09:00', end: '10:00',
  isAllDay: false, title: '', targetUserId: '',
})
