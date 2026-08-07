import { nameColor, nameInitials } from './utils'

// Аватар для пользователя (детерминированный цвет + инициалы)
export function UserAvatar({ name, size = 42 }: { name: string; size?: number }) {
  const color = nameColor(name)
  const ini   = nameInitials(name)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0, borderRadius: '50%' }}>
      <circle cx={size/2} cy={size/2} r={size/2} fill={color} />
      <text
        x={size/2} y={size/2}
        dominantBaseline="central" textAnchor="middle"
        fontSize={size * 0.38} fontWeight={700} fontFamily="Inter, sans-serif"
        fill="#fff"
      >{ini}</text>
    </svg>
  )
}

export function GroupAvatar({ name, color, size = 42 }: { name: string; color: string; size?: number }) {
  const letter = (name.trim()[0] ?? '?').toUpperCase()
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0, borderRadius: '50%' }}>
      <circle cx={size/2} cy={size/2} r={size/2} fill={color} />
      <text
        x={size/2} y={size/2}
        dominantBaseline="central" textAnchor="middle"
        fontSize={size * 0.42} fontWeight={700} fontFamily="Inter, sans-serif"
        fill="#fff"
      >{letter}</text>
    </svg>
  )
}