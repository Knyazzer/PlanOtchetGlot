import React, { useState, useRef, useEffect } from 'react'
import { Hint } from '../../components/Hint'
import { parseD, MONTHS_RU, DAYS_RU } from './utils'

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
      <span style={{ fontSize:12, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.5px', display:'flex', alignItems:'center' }}>
        {label}
        {hint && <Hint text={hint} />}
      </span>
      {children}
    </div>
  )
}

export function DatePicker({ value, onChange, min }: { value: string; onChange: (v: string) => void; min?: string }) {
  const today    = new Date()
  const initDate = value ? parseD(value) : today
  const [year,   setYear]   = useState(initDate.getFullYear())
  const [month,  setMonth]  = useState(initDate.getMonth())
  const [open,   setOpen]   = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // sync calendar head when value changes externally
  useEffect(() => {
    if (value) { const d = parseD(value); setYear(d.getFullYear()); setMonth(d.getMonth()) }
  }, [value])

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function nav(dir: number) {
    let m = month + dir, y = year
    if (m > 11) { m = 0; y++ }
    if (m < 0)  { m = 11; y-- }
    setMonth(m); setYear(y)
  }

  function pick(d: number) {
    const s = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    if (min && s < min) return
    onChange(s)
    setOpen(false)
  }

  const displayVal = value
    ? (() => { const d = parseD(value); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}` })()
    : null

  const firstDow = (() => { const d = new Date(year, month, 1).getDay(); return d === 0 ? 6 : d - 1 })()
  const daysInMonth = new Date(year, month+1, 0).getDate()

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <div
        onMouseDown={() => setOpen(o => !o)}
        style={{
          display:'flex', alignItems:'center', gap:8,
          background:'var(--surface-2)', border:`1px solid ${open ? 'rgba(123,97,255,.5)' : 'var(--border)'}`,
          borderRadius:8, padding:'8px 10px', cursor:'pointer',
          transition:'border-color .15s', userSelect:'none', fontSize:14,
          color: displayVal ? 'var(--text-1)' : 'var(--text-muted)',
        }}
      >
        <span style={{ color:'var(--text-muted)', fontSize:14 }}>📅</span>
        <span style={{ flex:1 }}>{displayVal ?? 'Выбрать дату'}</span>
        {displayVal && (
          <span
            onMouseDown={e => { e.stopPropagation(); onChange(''); }}
            style={{ color:'var(--text-muted)', fontSize:12, padding:'2px 4px', borderRadius:4, lineHeight:1 }}
          >✕</span>
        )}
      </div>

      {open && (
        <div data-datepicker-open style={{
          position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:400,
          background:'var(--surface-1)', border:'1px solid var(--border)',
          borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,.4)',
          padding:16, minWidth:260,
          animation:'dropDown .15s ease',
        }}>
          {/* header */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <button onMouseDown={e => { e.preventDefault(); nav(-1) }} style={{ width:26, height:26, borderRadius:6, background:'var(--surface-2)', border:'1px solid var(--border)', color:'var(--text-2)', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}>‹</button>
            <span style={{ fontSize:14, fontWeight:700, color:'var(--text-1)' }}>{MONTHS_RU[month]} {year}</span>
            <button onMouseDown={e => { e.preventDefault(); nav(1) }} style={{ width:26, height:26, borderRadius:6, background:'var(--surface-2)', border:'1px solid var(--border)', color:'var(--text-2)', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}>›</button>
          </div>

          {/* grid */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 34px)', gap:2 }}>
            {DAYS_RU.map(d => (
              <div key={d} style={{ width:34, height:24, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'var(--text-muted)', letterSpacing:'.5px' }}>{d}</div>
            ))}
            {Array.from({ length: firstDow }, (_, i) => <div key={'e'+i} style={{ width:34, height:34 }} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const d = i + 1
              const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
              const isToday   = d === today.getDate() && month === today.getMonth() && year === today.getFullYear()
              const isSel     = ds === value
              const isDisabled = min ? ds < min : false
              return (
                <div
                  key={d}
                  onMouseDown={e => { e.preventDefault(); pick(d) }}
                  style={{
                    width:34, height:34, borderRadius:8,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:14, cursor: isDisabled ? 'default' : 'pointer',
                    fontWeight: isToday || isSel ? 700 : 400,
                    color: isDisabled ? 'var(--text-muted)' : isSel ? '#fff' : isToday ? 'var(--text-1)' : 'var(--text-2)',
                    background: isSel ? '#F97316' : 'transparent',
                    opacity: isDisabled ? 0.3 : 1,
                    transition:'all .1s',
                  }}
                  onMouseEnter={e => { if (!isSel && !isDisabled) (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)' }}
                  onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = isSel ? '#F97316' : 'transparent' }}
                >{d}</div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Segmented control ──────────────────────────────────────────────────────────
export function SegmentedControl<T extends string>({ value, options, onChange }: { value: T; options: readonly [T, string][]; onChange: (v: T) => void }) {
  return (
    <div style={{ display:'flex', background:'var(--surface-2)', borderRadius:8, padding:3, gap:2 }}>
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} style={{
          padding:'5px 14px', borderRadius:6, border:'none', cursor:'pointer',
          background: value === v ? 'var(--surface-1)' : 'none',
          color: value === v ? 'var(--text-1)' : 'var(--text-muted)',
          fontFamily:'Inter,sans-serif', fontSize:14, fontWeight: value === v ? 600 : 400,
          boxShadow: value === v ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
        }}>
          {label}
        </button>
      ))}
    </div>
  )
}

// ── Toast ──────────────────────────────────────────────────────────────────────
export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div style={{ position:'fixed', bottom:28, left:'50%', transform:'translateX(-50%)', zIndex:9999, pointerEvents:'none' }}>
      <div style={{ background:'var(--surface-1)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 18px', fontSize:14, color:'var(--text-1)', boxShadow:'0 4px 20px rgba(0,0,0,0.4)', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ color:'#F59E0B', fontSize:16, lineHeight:1 }}>⚠</span>
        {message}
      </div>
    </div>
  )
}