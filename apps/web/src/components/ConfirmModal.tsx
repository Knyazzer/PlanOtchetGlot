import { useState, useRef, useCallback, useEffect } from 'react'
import { ROLE } from '../lib/roleColors'

// Дизайн-модал подтверждения вместо нативного confirm(). Хук возвращает confirm(opts): Promise<boolean>
// и элемент confirmUI для рендера. Закрытие — по железному правилу попапов (mousedown+mouseup на оверлее),
// без блюра. Esc = отмена.

type ConfirmOpts = { title?: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }

export function useConfirm() {
  const [state, setState] = useState<{ opts: ConfirmOpts; resolve: (v: boolean) => void } | null>(null)
  const confirm = useCallback((opts: ConfirmOpts) => new Promise<boolean>(resolve => setState({ opts, resolve })), [])
  const finish = (v: boolean) => { state?.resolve(v); setState(null) }
  const confirmUI = state ? <ConfirmDialog opts={state.opts} onCancel={() => finish(false)} onConfirm={() => finish(true)} /> : null
  return { confirm, confirmUI }
}

function ConfirmDialog({ opts, onCancel, onConfirm }: { opts: ConfirmOpts; onCancel: () => void; onConfirm: () => void }) {
  const down = useRef(false)
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); if (e.key === 'Enter') onConfirm() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onCancel, onConfirm])

  const accent = opts.danger ? ROLE.danger : ROLE.primary
  return (
    <div
      onMouseDown={e => { down.current = e.target === e.currentTarget }}
      onMouseUp={e => { if (down.current && e.target === e.currentTarget) onCancel(); down.current = false }}
      style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div onMouseDown={e => e.stopPropagation()} style={{ width: 380, maxWidth: '100%', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 16, padding: 22, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        {opts.title && <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8 }}>{opts.title}</div>}
        <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 20 }}>{opts.message}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-2)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>{opts.cancelLabel ?? 'Отмена'}</button>
          <button autoFocus onClick={onConfirm} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: accent, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>{opts.confirmLabel ?? 'Подтвердить'}</button>
        </div>
      </div>
    </div>
  )
}
