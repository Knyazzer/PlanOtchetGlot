import React, { useState, useRef, useEffect } from 'react'
import { formatName } from '../../lib/utils'
import type { TaskLogEntry, HistoryGroup } from './types'
import { ACTION_LABELS, fmtTs, groupEntries } from './utils'

export function HistoryGroupRow({ group, isFirst, isLast, hasLineAfter }: { group: HistoryGroup; isFirst: boolean; isLast: boolean; hasLineAfter: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const isCollapsed = group.entries.length > 1
  // свёрнуто: показываем первую и последнюю запись группы
  const first = group.entries[0]
  const last  = group.entries[group.entries.length - 1]

  const dotBg = isFirst
    ? 'linear-gradient(135deg,#FF6B35,#E8194B)'
    : isLast
      ? 'linear-gradient(135deg,#29BF12,#0EA5E9)'
      : 'var(--surface-3)'

  return (
    <div style={{ display:'flex', gap:12, position:'relative', paddingBottom: hasLineAfter ? 16 : 0 }}>
      {hasLineAfter && (
        <div style={{ position:'absolute', left:15, top:28, bottom:0, width:2, background:'var(--border)' }} />
      )}
      <div
        style={{ width:30, height:30, borderRadius:'50%', background: dotBg, border:'2px solid var(--border)', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:isCollapsed ? 10 : 12, fontWeight:700, marginTop:2, zIndex:1, cursor: isCollapsed ? 'pointer' : 'default' }}
        onClick={() => isCollapsed && setExpanded(x => !x)}
      >
        {isFirst ? '★' : isLast ? '●' : isCollapsed ? group.entries.length : '·'}
      </div>

      <div style={{ flex:1, paddingTop:4 }}>
        {/* свёрнутая группа */}
        {isCollapsed && !expanded && (
          <div>
            <div style={{ fontSize:14, color:'var(--text-1)', lineHeight:1.4 }}>
              {ACTION_LABELS[last.action]?.(last.meta ?? {}) ?? last.action}
            </div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>
              {formatName(last.user.name)} · {fmtTs(last.createdAt)}
            </div>
            <button
              onClick={() => setExpanded(true)}
              style={{ marginTop:5, background:'none', border:'none', padding:0, cursor:'pointer', color:'var(--text-muted)', fontSize:12, fontFamily:'Inter,sans-serif' }}
            >
              Показать все {group.entries.length} изменения ›
            </button>
          </div>
        )}

        {/* развёрнутая группа или одиночная запись */}
        {(!isCollapsed || expanded) && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {group.entries.map((e, ei) => (
              <div key={e.id}>
                <div style={{ fontSize:14, color:'var(--text-1)', lineHeight:1.4 }}>
                  {ACTION_LABELS[e.action]?.(e.meta ?? {}) ?? e.action}
                </div>
                <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>
                  {formatName(e.user.name)} · {fmtTs(e.createdAt)}
                </div>
                {ei < group.entries.length - 1 && (
                  <div style={{ height:1, background:'var(--border)', margin:'8px 0 0' }} />
                )}
              </div>
            ))}
            {expanded && isCollapsed && (
              <button
                onClick={() => setExpanded(false)}
                style={{ background:'none', border:'none', padding:0, cursor:'pointer', color:'var(--text-muted)', fontSize:12, fontFamily:'Inter,sans-serif', textAlign:'left' }}
              >
                Свернуть ‹
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function TaskHistory({ entries, isLoading }: { entries: TaskLogEntry[]; isLoading: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [entries])

  if (isLoading) return (
    <div style={{ padding:'32px 0', textAlign:'center', color:'var(--text-muted)', fontSize:14 }}>Загрузка...</div>
  )
  if (entries.length === 0) return (
    <div style={{ padding:'32px 0', textAlign:'center', color:'var(--text-muted)', fontSize:14 }}>История пуста</div>
  )
  const groups = groupEntries(entries)
  return (
    <div ref={scrollRef} style={{ display:'flex', flexDirection:'column', gap:0, overflowY:'auto', maxHeight:340 }}>
      {groups.map((g, i) => (
        <HistoryGroupRow
          key={g.entries[0].id}
          group={g}
          isFirst={i === 0}
          isLast={i === groups.length - 1}
          hasLineAfter={i < groups.length - 1}
        />
      ))}
    </div>
  )
}
