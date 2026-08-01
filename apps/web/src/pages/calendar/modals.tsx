import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatName } from '../../lib/utils'
import { Hint } from '../../components/Hint'
import type { ModalState, EntryModalState, ApiMember, EntryType } from './types'
import { TYPE_COLOR, LOCATIONS, MY_EVENT_TYPES, SHARED_ENTRY_TYPES, HR_ENTRY_TYPES } from './constants'
import { toYMD } from './utils'
import { DatePicker } from '../../ui-kit/components/DatePicker'
import { ClockDial } from '../../ui-kit/components/ClockDial'

// Строка 'YYYY-MM-DD' → локальная Date (без сдвига таймзоны от new Date(str))
function ymdToDate(s?: string): Date | undefined {
  if (!s) return undefined
  const [y, m, d] = s.split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d) : undefined
}

// Обёртки: модалки хранят дату/время строками — китовые пикеры работают с Date/строкой.
function DateField({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  return (
    <DatePicker
      value={value ? { from: ymdToDate(value), to: undefined } : undefined}
      onChange={(v) => onChange(v?.from ? toYMD(v.from) : '')}
      placeholder="Выбрать дату"
      className="w-full"
    />
  )
}

// ── Event modal ────────────────────────────────────────────────────────────
export function EventModal({ modal, onChange, onSubmit, onDelete, onClose, canEdit }: {
  modal: ModalState
  onChange: (p: Partial<ModalState>) => void
  onSubmit: () => void; onDelete: () => void; onClose: () => void; canEdit: boolean
}) {
  const isEdit = !!modal.editId
  const inp: React.CSSProperties = { width:'100%', background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 11px', color:'var(--text-1)', fontFamily:'Inter,sans-serif', fontSize:13, outline:'none' }
  const lbl: React.CSSProperties = { fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:6, display:'block' }
  const hasVyezd = modal.location.includes('vyezd')

  const [memberSearch, setMemberSearch] = useState('')
  const [pickerOpen,   setPickerOpen]   = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const mdRef = useRef(false)

  const { data: members = [] } = useQuery<ApiMember[]>({
    queryKey: ['users:members'],
    queryFn:  () => api.get('/users/members').then(r => r.data),
  })

  useEffect(() => {
    if (!pickerOpen) return
    function h(e: MouseEvent) { if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [pickerOpen])

  const filteredMembers = members.filter(m => m.name.toLowerCase().includes(memberSearch.toLowerCase()))
  const selectedNames = members.filter(m => modal.participantIds.includes(m.id)).map(m => m.name)

  function toggleParticipant(id: string) {
    const ids = modal.participantIds.includes(id)
      ? modal.participantIds.filter(x => x !== id)
      : [...modal.participantIds, id]
    onChange({ participantIds: ids })
  }

  return (
    <div onMouseDown={e => { mdRef.current = e.target === e.currentTarget }} onMouseUp={e => { if (mdRef.current && e.target === e.currentTarget) onClose() }} style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ background:'var(--surface-2)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:16, padding:24, width:420, maxWidth:'90vw', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.5)', fontFamily:'Inter,sans-serif' }}>
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

        <div style={{ marginBottom:14 }}>
          <span style={lbl}>Дата</span>
          <DateField value={modal.date} onChange={(v) => onChange({ date: v })} />
        </div>

        <div style={{ marginBottom:14 }}>
          <span style={lbl}>Время</span>
          <div style={{ display:'flex', justifyContent:'center', paddingTop:6 }}>
            <ClockDial value={{ start: modal.start, end: modal.end }} onChange={(v) => onChange({ start: v.start, end: v.end })} />
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
          <div ref={pickerRef} style={{ position:'relative' }}>
            <div
              onClick={() => { setMemberSearch(''); setPickerOpen(o => !o) }}
              style={{ ...inp, cursor:'pointer', minHeight:38, display:'flex', flexWrap:'wrap', gap:4, alignItems:'center', padding:'6px 10px' }}
            >
              {selectedNames.length === 0
                ? <span style={{ color:'var(--text-muted)', fontSize:12 }}>Добавить участников...</span>
                : selectedNames.map(n => (
                    <span key={n} style={{ fontSize:11, padding:'2px 8px', borderRadius:12, background:'rgba(139,92,246,0.2)', color:'#8B5CF6', fontWeight:600 }}>{n}</span>
                  ))
              }
            </div>
            {pickerOpen && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:300, background:'var(--surface-1)', border:'1px solid var(--border)', borderRadius:8, marginTop:4, boxShadow:'0 8px 24px rgba(0,0,0,0.4)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
                <div style={{ padding:'8px 10px', borderBottom:'1px solid var(--border)' }}>
                  <input autoFocus value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Поиск..." onMouseDown={e => e.stopPropagation()}
                    style={{ width:'100%', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:6, padding:'6px 8px', color:'var(--text-1)', fontFamily:'Inter,sans-serif', fontSize:12, outline:'none', boxSizing:'border-box' }} />
                </div>
                <div style={{ maxHeight:180, overflowY:'auto' }}>
                  {filteredMembers.map(m => {
                    const sel = modal.participantIds.includes(m.id)
                    return (
                      <div key={m.id} onMouseDown={e => { e.preventDefault(); toggleParticipant(m.id) }}
                        style={{ padding:'9px 12px', fontSize:13, color:'var(--text-1)', cursor:'pointer', display:'flex', alignItems:'center', gap:8, background: sel ? 'rgba(139,92,246,0.1)' : 'transparent' }}
                        onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = sel ? 'rgba(139,92,246,0.1)' : 'transparent' }}>
                        <div style={{ width:14, height:14, borderRadius:3, border:`1.5px solid ${sel ? '#8B5CF6' : 'var(--text-muted)'}`, background: sel ? '#8B5CF6' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, color:'#fff', flexShrink:0 }}>{sel ? '✓' : ''}</div>
                        {formatName(m.name)}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
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
    <div onMouseDown={e => { mdRef.current = e.target === e.currentTarget }} onMouseUp={e => { if (mdRef.current && e.target === e.currentTarget) onClose() }} style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center' }}>
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
          <DateField value={modal.date} onChange={(v) => onChange({ date: v })} />
        </div>

        {!isHR && (
          <div style={{ marginBottom:14 }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginBottom:10 }}>
              <input type="checkbox" checked={modal.isAllDay} onChange={e => onChange({ isAllDay: e.target.checked })} />
              <span style={{ fontSize:13, color:'var(--text-2)' }}>Весь день</span>
            </label>
            {!modal.isAllDay && (
              <div style={{ display:'flex', justifyContent:'center' }}>
                <ClockDial value={{ start: modal.start, end: modal.end }} onChange={(v) => onChange({ start: v.start, end: v.end })} />
              </div>
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
