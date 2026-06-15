import { useId } from 'react'

// Nexus brand icon — orbital core (two ellipses ±40° + center dot)
// Squircle frame R=0.225, gradient #3A0FA6→#4311AA
export function NexusIcon({ size = 32 }: { size?: number }) {
  const uid = useId()
  const gid = `nx-g-${uid}`
  const cid = `nx-c-${uid}`
  const rx = Math.round(100 * 0.225)

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none"
      xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, display: 'block' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="100" x2="100" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3A0FA6" />
          <stop offset="100%" stopColor="#4311AA" />
        </linearGradient>
        <clipPath id={cid}>
          <rect x="0" y="0" width="100" height="100" rx={rx} ry={rx} />
        </clipPath>
      </defs>
      <rect x="0" y="0" width="100" height="100" rx={rx} ry={rx} fill={`url(#${gid})`} />
      <g clipPath={`url(#${cid})`}>
        <ellipse cx="50" cy="50" rx="34" ry="12"
          stroke="white" fill="none" strokeWidth="7"
          transform="rotate(-40 50 50)" />
        <ellipse cx="50" cy="50" rx="34" ry="12"
          stroke="white" fill="none" strokeWidth="7"
          transform="rotate(40 50 50)" />
        <circle cx="50" cy="50" r="8" fill="white" />
      </g>
    </svg>
  )
}
