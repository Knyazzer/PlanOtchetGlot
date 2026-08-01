export function fmtMoney(v: string | null | undefined) {
  if (!v) return '—'
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(v))
}
