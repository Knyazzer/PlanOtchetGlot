// ── RoadmapTab ────────────────────────────────────────────────────────────────

export function RoadmapTab() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 32 }}>🗓</div>
      <div style={{ fontSize: 14, fontWeight: 500 }}>Дорожная карта</div>
      <div style={{ fontSize: 12 }}>Будет добавлена в следующей версии</div>
    </div>
  )
}