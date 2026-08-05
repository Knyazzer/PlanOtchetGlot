import { Component, type ReactNode } from 'react'

// Ловит краши рендера страницы, чтобы один сломанный экран не ронял всё приложение
// белым экраном (сайдбар/навигация/чат остаются живыми). Показывает имя страницы и
// текст ошибки — это даёт точную локализацию бага даже в минифицированном проде.
// Сброс — через key={page} в родителе (ремоунт при переходе на другую страницу).

interface Props {
  /** Человекочитаемое имя текущей страницы — попадает в сообщение и в console.error */
  pageLabel: string
  children: ReactNode
}
interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Явный маркер в консоли — видно страницу даже при минифицированном стеке
    console.error(`[Nexus] Краш на странице «${this.props.pageLabel}»:`, error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div style={{ padding: '48px 40px', maxWidth: 640, margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
        <div style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14,
          padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)' }}>
            Что-то пошло не так
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.6 }}>
            Ошибка на странице <b style={{ color: 'var(--text-1)' }}>«{this.props.pageLabel}»</b>.
            Остальные разделы работают — выберите другой в меню слева.
          </div>
          <div style={{
            fontSize: 12, fontFamily: 'monospace', color: '#f87171',
            background: 'rgba(232,25,75,0.08)', border: '1px solid rgba(232,25,75,0.25)',
            borderRadius: 8, padding: '10px 12px', wordBreak: 'break-word',
          }}>
            {error.message || String(error)}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              alignSelf: 'flex-start', fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
              background: 'linear-gradient(135deg,#FF6B35,#E8194B)', border: 'none', color: '#fff',
              borderRadius: 8, padding: '9px 18px', cursor: 'pointer',
            }}
          >
            Попробовать снова
          </button>
        </div>
      </div>
    )
  }
}
