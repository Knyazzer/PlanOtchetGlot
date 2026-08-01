import { cn } from '../lib/cn'

/**
 * Логотип-лакап продукта экосистемы. Строится вокруг ГОТОВОЙ SVG-иконки
 * (`iconSrc`, squircle с градиентом+текстурой+белым символом — LOCKED, как есть).
 * Подписи — только по-русски.
 *
 * Имя и подпись НЕ придумывай — бери из реестра `LOCKUP` (`brand.ts`):
 * `<Logo iconSrc={icon} {...LOCKUP.support} />`. Полный канон — docs/LOGOS.md.
 * Шрифт лакапа — Steppe (fallback Inter); подпись по умолчанию «Мегаполис Медиа»,
 * исключение — поддержка «Мегаполис Плеер».
 *
 * Варианты:
 *  • `variant="full"`   — полный логотип: название продукта (сверху) + компания (снизу).
 *  • `variant="compact"`— сокращённый: только название продукта. Ориентация:
 *       `orientation="horizontal"` — текст справа от иконки;
 *       `orientation="vertical"`   — текст под иконкой (по центру).
 *
 * Размеры (икона / продукт / компания): sm 32/15/10 · md 44/17/11.5 · lg 56/21/13.
 */
export function Logo({
  iconSrc,
  mark,
  name,
  company = 'Мегаполис Медиа',
  variant = 'full',
  orientation = 'horizontal',
  size = 'md',
  className,
}: {
  /** URL готовой SVG-иконки (brand/logos). Если не задан — рисуется буквенная марка. */
  iconSrc?: string
  /** буквенная марка (акцент-сквиркл) — фолбэк, когда нет iconSrc; по умолч. первая буква имени */
  mark?: string
  /** название продукта по-русски */
  name: string
  /** название компании (нижняя строка полного логотипа) */
  company?: string
  variant?: 'full' | 'compact'
  orientation?: 'horizontal' | 'vertical'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const vertical = orientation === 'vertical'
  const box = size === 'sm' ? 32 : size === 'lg' ? 56 : 44
  const nameSize = size === 'sm' ? 15 : size === 'lg' ? 21 : 17
  const companySize = size === 'sm' ? 10 : size === 'lg' ? 13 : 11.5
  const showCompany = variant === 'full' && !!company

  const text = (
    <div className={cn('leading-tight', vertical && 'text-center')}>
      <div
        className="font-extrabold whitespace-nowrap"
        style={{ fontSize: nameSize, letterSpacing: '-0.02em', color: 'var(--text)', fontFamily: 'var(--font-ui)' }}
      >
        {name}
      </div>
      {showCompany && (
        <div className="uppercase whitespace-nowrap" style={{ fontSize: companySize, color: 'var(--muted)', fontFamily: 'var(--font-ui)', letterSpacing: '0.14em', marginTop: 2 }}>
          {company}
        </div>
      )}
    </div>
  )

  return (
    <div className={cn('inline-flex', vertical ? 'flex-col items-center gap-2' : 'flex-row items-center gap-3', className)}>
      {iconSrc ? (
        <img src={iconSrc} width={box} height={box} alt={name} className="shrink-0 select-none" draggable={false} style={{ borderRadius: box * 0.225 }} />
      ) : (
        <span className="grid shrink-0 select-none place-items-center font-bold text-[var(--accent-contrast)]" style={{ width: box, height: box, borderRadius: box * 0.225, background: 'var(--accent)', fontSize: box * 0.44 }}>
          {mark ?? name[0]?.toUpperCase()}
        </span>
      )}
      {text}
    </div>
  )
}
