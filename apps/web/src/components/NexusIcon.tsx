import nexusLogo from '../assets/nexus.svg'

// Логотип Nexus — канонический (megapolis-platform/brand/logos/nexus.svg, 1:1).
// Squircle (r=0.225) + градиент #3A0FA6→#4311AA + корпоративная текстура (opacity 0.21) + орбитальный символ.
// Символ LOCKED; править логотип только из бренд-канона (см. BRAND.md), затем переэкспортировать svg сюда.
export function NexusIcon({ size = 32 }: { size?: number }) {
  return (
    <img
      src={nexusLogo}
      width={size}
      height={size}
      alt="Nexus"
      style={{ flexShrink: 0, display: 'block' }}
    />
  )
}