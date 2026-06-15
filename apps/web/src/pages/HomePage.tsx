import { Zap } from 'lucide-react'

export function HomePage() {
  return (
    <div style={{ padding: '32px 36px', maxWidth: 960 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Zap size={20} style={{ color: 'var(--accent-s)' }} />
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)' }}>Главная</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
          Пульс компании — новости, кто работает, глобальные задачи и статусы.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <PlaceholderCard title="Новости компании" description="Важные объявления и обновления" />
        <PlaceholderCard title="Кто работает сегодня" description="Занятость по отделам — сводка" />
        <PlaceholderCard title="Глобальные задачи" description="Задачи без привязки к проекту" />
        <PlaceholderCard title="Статусы и дедлайны" description="Критичные дедлайны ближайших 7 дней" />
      </div>
    </div>
  )
}

function PlaceholderCard({ title, description }: { title: string; description: string }) {
  return (
    <div style={{
      background: 'var(--surface-2)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '24px',
      minHeight: 140,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{description}</div>
      <div style={{
        marginTop: 'auto',
        fontSize: 11, color: 'var(--text-muted)',
        background: 'rgba(255,255,255,0.03)',
        border: '1px dashed var(--border)',
        borderRadius: 8,
        padding: '12px 14px',
        textAlign: 'center',
      }}>
        В разработке
      </div>
    </div>
  )
}
