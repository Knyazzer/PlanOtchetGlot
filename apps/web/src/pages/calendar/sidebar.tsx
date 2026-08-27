import type { CatDef, CalEvent } from './types'
import { MONTHS_RU_GEN, WEEKDAYS_F } from './constants'
import { parseYMD } from './utils'

export function CalCheckbox({ color, checked, label, onClick }: { color: string; checked: boolean; label: string; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 6px', borderRadius:6, cursor:'pointer' }}>
      <div style={{ width:13, height:13, borderRadius:3, flexShrink:0, border:`2px solid ${color}`, background: checked ? color : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'#fff' }}>
        {checked ? '✓' : ''}
      </div>
      <div style={{ fontSize:12, fontWeight:500, color:'var(--text-2)', flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{label}</div>
    </div>
  )
}

export function SidebarSection({ label, cats, visible, onToggle, onAdd, children }: {
  label: string; cats: CatDef[]; visible: Set<string>; onToggle: (id: string) => void
  onAdd?: () => void; children?: React.ReactNode
}) {
  return (
    <>
      <div style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 6px 2px' }}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.8px', flex:1 }}>{label}</div>
        {onAdd && (
          <button onClick={onAdd} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:14, lineHeight:1, padding:'0 2px', borderRadius:4 }} title="Создать">+</button>
        )}
      </div>
      {cats.map(c => (
        <CalCheckbox key={c.id} color={c.color} checked={visible.has(c.id)} label={c.label} onClick={() => onToggle(c.id)} />
      ))}
      {children}
    </>
  )
}

export function GlobalCalRow({ isAdmin, onAdd }: { isAdmin: boolean; onAdd: () => void }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 6px', borderRadius:6 }}>
      <div style={{ width:13, height:13, borderRadius:3, flexShrink:0, background:'#0EA5E9', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'#fff' }}>✓</div>
      <div style={{ fontSize:12, fontWeight:500, color:'var(--text-2)', flex:1 }}>Общий</div>
      {isAdmin && (
        <button onClick={onAdd} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:14, lineHeight:1, padding:'0 2px', borderRadius:4 }} title="Создать запись">+</button>
      )}
    </div>
  )
}

// ── Side panel ─────────────────────────────────────────────────────────────
export function SidePanel({ ymd, eventsFor, allDayFor, onClose, onEventClick, onCreateClick }: {
  ymd: string
  eventsFor: (ymd: string) => CalEvent[]
  allDayFor:  (ymd: string) => CalEvent[]
  onClose: () => void; onEventClick: (evt: CalEvent) => void; onCreateClick: () => void
}) {
  const date = parseYMD(ymd); const dowIdx = (date.getDay() + 6) % 7
  const dayEvts = eventsFor(ymd).sort((a,b) => a.start.localeCompare(b.start))
  const allDay  = allDayFor(ymd)
  const allItems = [...allDay, ...dayEvts]

  return (
    <div style={{ width:272, flexShrink:0, background:'var(--surface-1)', borderLeft:'1px solid var(--border)', display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexShrink:0 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--text-1)' }}>{date.getDate()} {MONTHS_RU_GEN[date.getMonth()]} {date.getFullYear()}</div>
          <div style={{ fontSize:12, color:'var(--text-3)', marginTop:2 }}>{WEEKDAYS_F[dowIdx]}</div>
        </div>
        <button onClick={onClose} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)', color:'var(--text-3)', width:28, height:28, borderRadius:7, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15 }}>✕</button>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:12, display:'flex', flexDirection:'column', gap:8 }}>
        {allItems.length === 0 ? (
          <div style={{ color:'var(--text-muted)', fontSize:14, textAlign:'center', marginTop:24, lineHeight:1.6 }}>Нет событий<br/>на этот день</div>
        ) : allItems.map(evt => (
          <div key={evt.id} onClick={() => onEventClick(evt)}
            style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 12px', display:'flex', gap:10, alignItems:'flex-start', cursor:'pointer' }}>
            <div style={{ width:3, borderRadius:2, flexShrink:0, alignSelf:'stretch', minHeight:32, background:evt.color }} />
            <div style={{ flex:1, overflow:'hidden' }}>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--text-1)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginBottom:3 }}>{evt.title}</div>
              <div style={{ fontSize:12, color:'var(--text-3)', fontWeight:500 }}>
                {evt.isAllDay ? 'Весь день' : `${evt.start} — ${evt.end}`}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding:'12px 14px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
        <button onClick={onCreateClick} style={{ width:'100%', fontFamily:'Inter,sans-serif', fontSize:14, fontWeight:700, background:'#7B61FF', border:'none', color:'#fff', borderRadius:8, padding:'9px 0', cursor:'pointer' }}>
          + Создать событие
        </button>
      </div>
    </div>
  )
}