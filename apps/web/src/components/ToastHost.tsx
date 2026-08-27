import { useToastStore } from '../lib/toast'

// Монтируется один раз в корне приложения. Рисует активные тосты сверху по центру,
// стопкой, без блюра, в стиле кита. Клик по тосту — закрыть досрочно.
const TONE: Record<string, { icon: string; color: string }> = {
  success: { icon: '✓', color: 'var(--role-success)' },
  info:    { icon: 'ℹ', color: 'var(--role-info)' },
  sent:    { icon: '➜', color: 'var(--accent)' },
}

export function ToastHost() {
  const toasts = useToastStore(s => s.toasts)
  const remove = useToastStore(s => s.remove)

  return (
    <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10000, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none' }}>
      <style>{`@keyframes nx-toast-in { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: none } }`}</style>
      {toasts.map(t => {
        const tone = TONE[t.tone] ?? TONE.success
        return (
          <div
            key={t.id}
            onClick={() => remove(t.id)}
            style={{ pointerEvents: 'auto', cursor: 'pointer', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 16px', fontSize: 14, color: 'var(--text-1)', boxShadow: '0 6px 24px rgba(0,0,0,0.28)', maxWidth: '80vw', display: 'flex', alignItems: 'center', gap: 9, animation: 'nx-toast-in 0.18s ease-out' }}
          >
            <span style={{ color: tone.color, fontSize: 15, lineHeight: 1, fontWeight: 700, flexShrink: 0 }}>{tone.icon}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.message}</span>
          </div>
        )
      })}
    </div>
  )
}
