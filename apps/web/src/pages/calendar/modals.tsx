import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatName } from '../../lib/utils'
import { Hint } from '../../components/Hint'
import type { ModalState, EntryModalState, ApiMember, EntryType } from './types'
import { TYPE_COLOR, LOCATIONS, MY_EVENT_TYPES, SHARED_ENTRY_TYPES, HR_ENTRY_TYPES } from './constants'
import { toYMD } from './utils'
import { ClockDial } from '../../ui-kit/components/ClockDial'
import { DayPicker } from 'react-day-picker'
import { ru } from 'date-fns/locale'
import { format } from 'date-fns'
import { CalendarDays, Clock } from 'lucide-react'

// Строка 'YYYY-MM-DD' → локальная Date (без сдвига таймзоны от new Date(str))
function ymdToDate(s?: string): Date | undefined {
  if (!s) return undefined
  const [y, m, d] = s.split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d) : undefined
}

const chipStyle: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
  background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '9px 11px', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 13,
  cursor: 'pointer', outline: 'none',
}
const miniBtn = (primary?: boolean): React.CSSProperties => ({
  flex: 1, borderRadius: 8, padding: '8px 0', fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  border: primary ? 'none' : '1px solid var(--border)',
  background: primary ? 'linear-gradient(135deg,#FF6B35,#E8194B)' : 'none',
  color: primary ? '#fff' : 'var(--text-2)',
})

// Мини-модал поверх модалки события: клик по фону закрывает ТОЛЬКО его — stopPropagation не даёт
// родительской модалке-событию среагировать. Железное правило: mousedown+mouseup на фоне.
function MiniPicker({ open, onClose, side = 'center', cardSide = false, children }: { open: boolean; onClose: () => void; side?: 'left' | 'right' | 'center'; cardSide?: boolean; children: React.ReactNode }) {
  const down = useRef(false)
  if (!open) return null
  // cardSide (боковая карточка события может стоять и справа, и слева от обводки) —
  // мини-пикер центрируем: устойчиво независимо от позиции карточки.
  // Иначе (центрированная модалка записи): side left/right рядом с ней.
  const aside: React.CSSProperties = { position: 'fixed', top: '50%', transform: 'translateY(-50%)',
    ...(side === 'right' ? { left: 'calc(50% + 232px)' } : { right: 'calc(50% + 232px)' }) }
  const centered = side === 'center' || cardSide
  return (
    <div
      onMouseDown={(e) => { e.stopPropagation(); down.current = e.target === e.currentTarget }}
      onMouseUp={(e) => { e.stopPropagation(); if (down.current && e.target === e.currentTarget) onClose(); down.current = false }}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, ...(centered ? { display: 'flex', alignItems: 'center', justifyContent: 'center' } : {}) }}
    >
      <div onMouseDown={(e) => e.stopPropagation()} style={{ ...(centered ? {} : aside), background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 14, padding: 14, boxShadow: '0 24px 64px rgba(0,0,0,0.55)' }}>
        {children}
      </div>
    </div>
  )
}

// Чип даты (слева): клик → мини-модал с календарём + Готово/Сбросить.
function DateChip({ value, onChange, sideCard }: { value: string; onChange: (s: string) => void; sideCard?: boolean }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Date | undefined>(ymdToDate(value))
  useEffect(() => { if (open) setDraft(ymdToDate(value)) }, [open, value])
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={chipStyle}>
        <CalendarDays size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'left', color: value ? 'var(--text-1)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value ? format(ymdToDate(value)!, 'd MMM yyyy', { locale: ru }) : 'Выбрать дату'}
        </span>
      </button>
      <MiniPicker open={open} onClose={() => setOpen(false)} side="left" cardSide={sideCard}>
        <DayPicker mode="single" locale={ru} weekStartsOn={1} selected={draft} onSelect={setDraft} showOutsideDays />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button type="button" onClick={() => { onChange(''); setDraft(undefined); setOpen(false) }} style={miniBtn(false)}>Сбросить</button>
          <button type="button" onClick={() => { onChange(draft ? toYMD(draft) : ''); setOpen(false) }} style={miniBtn(true)}>Готово</button>
        </div>
      </MiniPicker>
    </>
  )
}

// Чип времени (справа): клик → мини-модал с круговым диапазоном (ClockDial) + Сохранить/Сбросить.
function TimeChip({ start, end, onChange, sideCard }: { start: string; end: string; onChange: (v: { start: string; end: string }) => void; sideCard?: boolean }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ start, end })
  useEffect(() => { if (open) setDraft({ start, end }) }, [open, start, end])
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={chipStyle}>
        <Clock size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'left' }}>{start} – {end}</span>
      </button>
      <MiniPicker open={open} onClose={() => setOpen(false)} side="right" cardSide={sideCard}>
        <ClockDial value={draft} onChange={setDraft} workHours={{ start: '10:00', end: '18:30' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button type="button" onClick={() => setDraft({ start, end })} style={miniBtn(false)}>Сбросить</button>
          <button type="button" onClick={() => { onChange(draft); setOpen(false) }} style={miniBtn(true)}>Сохранить</button>
        </div>
      </MiniPicker>
    </>
  )
}

// ── Event modal ────────────────────────────────────────────────────────────
export function EventModal({ modal, onChange, onSubmit, onDelete, onClose, canEdit, dimmed }: {
  modal: ModalState
  onChange: (p: Partial<ModalState>) => void
  onSubmit: () => void; onDelete: () => void; onClose: () => void; canEdit: boolean
  dimmed?: boolean  // §6: на время переноса силуэтом карточка гаснет
}) {
  const isEdit = !!modal.editId
  const inp: React.CSSProperties = { width:'100%', background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 11px', color:'var(--text-1)', fontFamily:'Inter,sans-serif', fontSize:13, outline:'none' }
  const lbl: React.CSSProperties = { fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:6, display:'block' }
  const hasVyezd = modal.location.includes('vyezd')

  const [memberSearch, setMemberSearch] = useState('')
  const [pickerOpen,   setPickerOpen]   = useState(false)

  const { data: members = [] } = useQuery<ApiMember[]>({
    queryKey: ['users:members'],
    queryFn:  () => api.get('/users/members').then(r => r.data),
  })

  // §6: якорим карточку сбоку от обводки — справа от неё; нет места справа → слева
  // (чтобы не перекрывать редактируемый день, напр. воскресенье у правого края).
  const [anchorLeft, setAnchorLeft] = useState<number | null>(null)
  useLayoutEffect(() => {
    const W = 380, GAP = 14
    const el = document.querySelector('[data-draft]') as HTMLElement | null
    if (!el) { setAnchorLeft(null); return }
    const r = el.getBoundingClientRect()
    setAnchorLeft(r.right + GAP + W <= window.innerWidth - 8 ? r.right + GAP : Math.max(8, r.left - GAP - W))
  }, [modal.date])

  const filteredMembers = members.filter(m => m.name.toLowerCase().includes(memberSearch.toLowerCase()))
  const selectedNames = members.filter(m => modal.participantIds.includes(m.id)).map(m => m.name)

  function toggleParticipant(id: string) {
    const ids = modal.participantIds.includes(id)
      ? modal.participantIds.filter(x => x !== id)
      : [...modal.participantIds, id]
    onChange({ participantIds: ids })
  }

  return (
    // §6: боковая карточка без затемнения — календарь под ней виден и кликабелен (закрытие вне — на уровне CalendarPage)
    <div data-card="1" style={{ position:'fixed', top:64, bottom:16, zIndex:900, width:380, maxWidth:'92vw', display:'flex', opacity: dimmed ? 0.3 : 1, pointerEvents: dimmed ? 'none' : 'auto', transition:'opacity 0.12s ease', ...(anchorLeft != null ? { left: anchorLeft } : { right: 16 }) }}>
      <div style={{ flex:1, background:'var(--surface-2)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:16, padding:22, overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.5)', fontFamily:'Inter,sans-serif' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div style={{ fontSize:15, fontWeight:700, color:'var(--text-1)' }}>{isEdit ? (canEdit ? 'Редактировать событие' : 'Просмотр события') : 'Новое событие'}</div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)', color:'var(--text-3)', borderRadius:6, width:28, height:28, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>

        <div style={{ pointerEvents: canEdit ? 'auto' : 'none', opacity: canEdit ? 1 : 0.85 }}>
        {/* Type picker */}
        <div style={{ marginBottom:16 }}>
          <span style={{ ...lbl, display:'flex', alignItems:'center' }}>Тип <Hint text="Встреча — событие с участниками и временем; Задача — личный to-do в Календаре; Личное — для планирования личного времени." width={250} /></span>
          <div style={{ display:'flex', gap:8 }}>
            {MY_EVENT_TYPES.map(t => {
              const sel = modal.type === t.value
              const color = TYPE_COLOR[t.value]
              return (
                <button key={t.value} onClick={() => onChange({ type: t.value })}
                  style={{ flex:1, padding:'7px 0', borderRadius:8, border:`1px solid ${sel ? color : 'var(--border)'}`, background: sel ? color+'22' : 'none', color: sel ? color : 'var(--text-3)', fontFamily:'Inter,sans-serif', fontSize:12, fontWeight: sel ? 700 : 400, cursor:'pointer' }}>
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ marginBottom:14 }}>
          <span style={lbl}>Название</span>
          <input autoFocus value={modal.title} onChange={e => onChange({ title: e.target.value })} onKeyDown={e => { if (e.key==='Enter') onSubmit() }} placeholder="Название события" style={inp} />
        </div>

        <div style={{ display:'flex', gap:10, marginBottom:14 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <span style={lbl}>Дата</span>
            <DateChip value={modal.date} onChange={(v) => onChange({ date: v })} sideCard />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <span style={lbl}>Время</span>
            <TimeChip start={modal.start} end={modal.end} onChange={(v) => onChange({ start: v.start, end: v.end })} sideCard />
          </div>
        </div>

        {/* Location picker */}
        <div style={{ marginBottom: hasVyezd ? 8 : 14 }}>
          <span style={{ ...lbl, display:'flex', alignItems:'center' }}>Место <Hint text="Площадка или онлайн-формат встречи. Можно выбрать несколько." /></span>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {LOCATIONS.map(loc => {
              const sel = modal.location.includes(loc.id)
              return (
                <button key={loc.id} onClick={() => {
                  const newLoc = sel ? modal.location.filter(l => l !== loc.id) : [...modal.location, loc.id]
                  onChange({ location: newLoc, ...(loc.id === 'vyezd' && sel ? { vyezdAddress: '' } : {}) })
                }}
                  style={{ padding:'5px 12px', borderRadius:20, border:`1px solid ${sel ? '#FF6B35' : 'var(--border)'}`, background: sel ? 'rgba(255,107,53,0.15)' : 'none', color: sel ? '#FF6B35' : 'var(--text-3)', fontFamily:'Inter,sans-serif', fontSize:12, fontWeight: sel ? 600 : 400, cursor:'pointer' }}>
                  {loc.label}
                </button>
              )
            })}
          </div>
        </div>
        {hasVyezd && (
          <div style={{ marginBottom:14 }}>
            <input value={modal.vyezdAddress} onChange={e => onChange({ vyezdAddress: e.target.value })} placeholder="Адрес выезда..." style={{ ...inp, fontSize:12 }} />
          </div>
        )}

        {/* Participant picker */}
        <div style={{ marginBottom:22 }}>
          <span style={{ ...lbl, display:'flex', alignItems:'center' }}>Участники <Hint text="Коллеги, приглашённые на встречу. Событие появится в Календаре у каждого участника." /></span>
          <div
            onClick={() => { setMemberSearch(''); setPickerOpen(true) }}
            style={{ ...inp, cursor:'pointer', minHeight:38, maxHeight:120, overflowY:'auto', display:'flex', flexWrap:'wrap', gap:4, alignItems:'center', alignContent:'flex-start', padding:'6px 10px' }}
          >
            {selectedNames.length === 0
              ? <span style={{ color:'var(--text-muted)', fontSize:12 }}>Добавить участников...</span>
              : selectedNames.map(n => (
                  <span key={n} style={{ fontSize:11, padding:'2px 8px', borderRadius:12, background:'rgba(139,92,246,0.2)', color:'#8B5CF6', fontWeight:600 }}>{n}</span>
                ))
            }
          </div>
          {/* Мини-модал выбора участников — свой скролл, не растит и не обрезается модалкой события */}
          <MiniPicker open={pickerOpen} onClose={() => setPickerOpen(false)} cardSide>
            <div style={{ width:320, maxWidth:'80vw', display:'flex', flexDirection:'column' }}>
              <input autoFocus value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Поиск сотрудника..."
                style={{ width:'100%', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px', color:'var(--text-1)', fontFamily:'Inter,sans-serif', fontSize:13, outline:'none', boxSizing:'border-box', marginBottom:8 }} />
              <div style={{ maxHeight:'50vh', overflowY:'auto', margin:'0 -4px' }}>
                {filteredMembers.map(m => {
                  const sel = modal.participantIds.includes(m.id)
                  return (
                    <div key={m.id} onMouseDown={e => { e.preventDefault(); toggleParticipant(m.id) }}
                      style={{ padding:'9px 12px', fontSize:13, color:'var(--text-1)', cursor:'pointer', display:'flex', alignItems:'center', gap:8, borderRadius:8, background: sel ? 'rgba(139,92,246,0.1)' : 'transparent' }}
                      onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = sel ? 'rgba(139,92,246,0.1)' : 'transparent' }}>
                      <div style={{ width:14, height:14, borderRadius:3, border:`1.5px solid ${sel ? '#8B5CF6' : 'var(--text-muted)'}`, background: sel ? '#8B5CF6' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, color:'#fff', flexShrink:0 }}>{sel ? '✓' : ''}</div>
                      {formatName(m.name)}
                    </div>
                  )
                })}
                {filteredMembers.length === 0 && <div style={{ padding:'12px', fontSize:12, color:'var(--text-muted)', textAlign:'center' }}>Никого не найдено</div>}
              </div>
              <button type="button" onClick={() => setPickerOpen(false)} style={{ ...miniBtn(true), marginTop:10 }}>Готово</button>
            </div>
          </MiniPicker>
        </div>
        </div>{/* end canEdit wrapper */}

        <div style={{ display:'flex', gap:8 }}>
          {isEdit && canEdit && (
            <button onClick={onDelete} style={{ flex:1, fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:600, background:'rgba(232,25,75,0.12)', border:'1px solid rgba(232,25,75,0.3)', color:'#E8194B', borderRadius:8, padding:'9px 0', cursor:'pointer' }}>Удалить</button>
          )}
          <button onClick={onClose} style={{ flex:1, fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:600, background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)', color:'var(--text-3)', borderRadius:8, padding:'9px 0', cursor:'pointer' }}>{canEdit ? 'Отмена' : 'Закрыть'}</button>
          {canEdit && (
            <button onClick={onSubmit} style={{ flex:2, fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:700, background:'linear-gradient(135deg,#FF6B35,#E8194B)', border:'none', color:'#fff', borderRadius:8, padding:'9px 0', cursor:'pointer' }}>
              {isEdit ? 'Сохранить' : 'Создать'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Entry modal (admin) ────────────────────────────────────────────────────
export function EntryModal({ modal, onChange, onSubmit, onDelete, onClose }: {
  modal: EntryModalState
  onChange: (p: Partial<EntryModalState>) => void
  onSubmit: () => void; onDelete: () => void; onClose: () => void
}) {
  const isEdit = !!modal.editId
  const isHR = modal.type.startsWith('hr_')
  const inp: React.CSSProperties = { width:'100%', background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 11px', color:'var(--text-1)', fontFamily:'Inter,sans-serif', fontSize:13, outline:'none' }
  const lbl: React.CSSProperties = { fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:6, display:'block' }

  const { data: members = [] } = useQuery<ApiMember[]>({
    queryKey: ['users:members'],
    queryFn:  () => api.get('/users/members').then(r => r.data),
    enabled:  isHR,
  })
  const mdRef = useRef(false)

  return (
    <div onMouseDown={e => { mdRef.current = e.target === e.currentTarget }} onMouseUp={e => { if (mdRef.current && e.target === e.currentTarget) onClose() }} style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ background:'var(--surface-2)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:16, padding:24, width:420, maxWidth:'90vw', boxShadow:'0 24px 64px rgba(0,0,0,0.5)', fontFamily:'Inter,sans-serif' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div style={{ fontSize:15, fontWeight:700, color:'var(--text-1)' }}>{isEdit ? 'Редактировать запись' : 'Новая запись'}</div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)', color:'var(--text-3)', borderRadius:6, width:28, height:28, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>

        <div style={{ marginBottom:14 }}>
          <span style={lbl}>Тип</span>
          <select value={modal.type} onChange={e => onChange({ type: e.target.value as EntryType, isAllDay: (e.target.value as string).startsWith('hr_') })}
            style={{ ...inp, appearance:'none', cursor:'pointer' }}>
            <optgroup label="Общие">
              {SHARED_ENTRY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </optgroup>
            <optgroup label="HR статусы">
              {HR_ENTRY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </optgroup>
          </select>
        </div>

        <div style={{ marginBottom:14 }}>
          <span style={lbl}>Название</span>
          <input autoFocus value={modal.title} onChange={e => onChange({ title: e.target.value })} onKeyDown={e => { if (e.key==='Enter') onSubmit() }} placeholder="Название" style={inp} />
        </div>

        <div style={{ marginBottom:14 }}>
          <span style={lbl}>Дата</span>
          <DateChip value={modal.date} onChange={(v) => onChange({ date: v })} />
        </div>

        {!isHR && (
          <div style={{ marginBottom:14 }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginBottom:10 }}>
              <input type="checkbox" checked={modal.isAllDay} onChange={e => onChange({ isAllDay: e.target.checked })} />
              <span style={{ fontSize:13, color:'var(--text-2)' }}>Весь день</span>
            </label>
            {!modal.isAllDay && (
              <TimeChip start={modal.start} end={modal.end} onChange={(v) => onChange({ start: v.start, end: v.end })} />
            )}
          </div>
        )}

        {isHR && (
          <div style={{ marginBottom:14 }}>
            <span style={lbl}>Сотрудник</span>
            <select value={modal.targetUserId} onChange={e => onChange({ targetUserId: e.target.value })} style={{ ...inp, appearance:'none', cursor:'pointer' }}>
              <option value="">— не выбран —</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        )}

        <div style={{ display:'flex', gap:8, marginTop:22 }}>
          {isEdit && (
            <button onClick={onDelete} style={{ flex:1, fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:600, background:'rgba(232,25,75,0.12)', border:'1px solid rgba(232,25,75,0.3)', color:'#E8194B', borderRadius:8, padding:'9px 0', cursor:'pointer' }}>Удалить</button>
          )}
          <button onClick={onClose} style={{ flex:1, fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:600, background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)', color:'var(--text-3)', borderRadius:8, padding:'9px 0', cursor:'pointer' }}>Отмена</button>
          <button onClick={onSubmit} style={{ flex:2, fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:700, background:'linear-gradient(135deg,#FF6B35,#E8194B)', border:'none', color:'#fff', borderRadius:8, padding:'9px 0', cursor:'pointer' }}>
            {isEdit ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  )
}
