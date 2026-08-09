import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ExpandedState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import * as Popover from '@radix-ui/react-popover'
import { ArrowDown, ArrowUp, Check, ChevronRight, ChevronsUpDown, GripVertical, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { DndContext, DragOverlay, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '../lib/cn'

// Строка-таблицы с dnd-kit: активная едет за курсором (transform), соседние раздвигаются,
// оригинал приглушается. Ручку-grip даём через render-prop (handle = attributes+listeners).
function SortableRow({ id, className, onClick, onMouseEnter, children }: {
  id: string | number; className?: string; onClick?: () => void; onMouseEnter?: () => void
  children: (handle: { attributes: Record<string, unknown>; listeners: Record<string, unknown> | undefined }) => ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  // Источник во время drag полностью прячем — его визуально замещает DragOverlay (без остаточного transform → нет «прыжка» на дропе)
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0 : 1, position: 'relative' }
  return (
    <tr ref={setNodeRef} style={style} className={className} onClick={onClick} onMouseEnter={onMouseEnter}>
      {children({ attributes, listeners })}
    </tr>
  )
}

interface DataTableProps<T> {
  columns: ColumnDef<T, any>[]
  data: T[]
  onAddRow?: () => void
  addRowLabel?: string
  onAddColumn?: () => void
  addColumnHint?: string
  /** контент вложенной (раскрывающейся) строки; включает колонку-шеврон */
  renderSubRow?: (row: T) => React.ReactNode
  /** можно ли раскрыть строку (по умолчанию — все, если задан renderSubRow) */
  getRowCanExpand?: (row: T) => boolean
  /** клик по строке (master-detail: открыть панель/попап). Взаимоисключим с раскрытием. */
  onRowClick?: (row: T) => void
  /** наведение на строку — для префетча детали (карточка откроется без вспышки skeleton) */
  onRowMouseEnter?: (row: T) => void
  /** id активной строки (подсветка выбранной в master-detail) */
  activeRowId?: string | number
  getRowId?: (row: T) => string | number
  /** спрятать тулбар (поиск/счётчик/колонки) — для встроенных/мелких таблиц */
  hideToolbar?: boolean
  /** заполнить высоту родителя с внутренним вертикальным скроллом + липким заголовком
      (master-detail панель фикс-высоты). Родитель должен быть height-bounded (h-full/min-h-0). */
  fill?: boolean
  /** начальная видимость колонок (напр. скрыть по умолчанию доп. столбцы, показываемые по выбору) */
  initialColumnVisibility?: VisibilityState
  /** ключ localStorage для персиста видимости и ПОРЯДКА колонок (переживают F5) */
  storageKey?: string
  /** разрешить перетаскивание заголовков для смены порядка столбцов (нативный drag) */
  reorderable?: boolean
  /** разрешить перетаскивание СТРОК за grip (ручной порядок); нужен getRowId */
  rowDragEnabled?: boolean
  /** дроп строки: перенести строку fromId на позицию строки toId */
  onRowReorder?: (fromId: string | number, toId: string | number) => void
}

/**
 * Единый DataTable: логика — TanStack (headless), вид — наши токены.
 * Сортировка по клику на заголовок, глобальный поиск, видимость колонок,
 * аккуратные hover-«+» для добавления строки и колонки (паттерн Airtable).
 */
export function DataTable<T>({ columns, data, onAddRow, addRowLabel = 'Добавить строку', onAddColumn, addColumnHint = 'Новый столбец', renderSubRow, getRowCanExpand, onRowClick, onRowMouseEnter, activeRowId, getRowId, hideToolbar, fill, initialColumnVisibility, storageKey, reorderable, rowDragEnabled, onRowReorder }: DataTableProps<T>) {
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const [dragRowId, setDragRowId] = useState<string | number | null>(null) // активная строка для DragOverlay
  const tableRef = useRef<HTMLTableElement>(null)
  const handleRowDragEnd = (e: DragEndEvent) => {
    setDragRowId(null)
    const { active, over } = e
    if (over && active.id !== over.id) onRowReorder?.(active.id, over.id)
  }
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  // Персист (F5): под storageKey хранится { visibility, order }.
  const persisted = (): { visibility?: VisibilityState; order?: string[] } => {
    if (!storageKey) return {}
    try { return JSON.parse(localStorage.getItem(storageKey) || '{}') } catch { return {} }
  }
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => ({ ...(initialColumnVisibility ?? {}), ...(persisted().visibility ?? {}) }))
  const [columnOrder, setColumnOrder] = useState<string[]>(() => persisted().order ?? [])
  useEffect(() => { if (storageKey) { try { localStorage.setItem(storageKey, JSON.stringify({ visibility: columnVisibility, order: columnOrder })) } catch { /* ignore */ } } }, [columnVisibility, columnOrder, storageKey])
  const dragCol = useRef<string | null>(null)
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const expandable = !!renderSubRow

  // ширина видимой области скроллера — чтобы раскрытая строка (вложенная таблица)
  // прижималась влево и скроллилась ВНУТРИ себя, а не вылезала за правый край.
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [viewW, setViewW] = useState(0)
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewW(el.clientWidth))
    ro.observe(el)
    setViewW(el.clientWidth)
    return () => ro.disconnect()
  }, [])


  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, columnVisibility, columnOrder, expanded },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onExpandedChange: setExpanded,
    getRowCanExpand: expandable ? (row) => (getRowCanExpand ? getRowCanExpand(row.original) : true) : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  })

  // min-width таблицы = сумма фикс. ширин колонок (+ гибкая/addcol/шеврон): на узком
  // экране колонки НЕ сжимаются (иначе текст наслаивается), а появляется гориз. скролл.
  const minWidth = table.getVisibleLeafColumns().reduce((s, c) => s + (parseInt(String((c.columnDef.meta as any)?.width ?? '')) || 160), 0) + (expandable ? 36 : 0) + (rowDragEnabled ? 32 : 0)

  // Перестановка столбцов: переносим колонку from на позицию to (нативный drag заголовков).
  const reorderColumns = (from: string, to: string) => {
    const base = columnOrder.length ? columnOrder : table.getAllLeafColumns().map((c) => c.id)
    const cur = [...base]
    const fi = cur.indexOf(from), ti = cur.indexOf(to)
    if (fi < 0 || ti < 0 || fi === ti) return
    cur.splice(fi, 1); cur.splice(ti, 0, from)
    setColumnOrder(cur)
  }

  return (
    <div className={cn('overflow-hidden bg-[var(--surface)] lg:rounded-[var(--radius)] lg:border lg:border-[var(--border)]', fill && 'flex h-full min-h-0 flex-col')}>
      {/* тулбар (переносится на узком) */}
      {!hideToolbar && (
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
        <div className="relative min-w-0 flex-1 sm:flex-none">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Поиск по таблице…"
            className="h-8 w-full rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border)] pl-8 pr-3 text-[13px] text-[var(--text)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] sm:w-64"
          />
        </div>
        <span className="mono whitespace-nowrap text-[12px] text-[var(--muted)]">{table.getFilteredRowModel().rows.length} записей</span>
        <div className="ml-auto">
          {/* видимость колонок */}
          <Popover.Root>
            <Popover.Trigger className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-[13px] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--border-strong)] outline-none">
              <SlidersHorizontal className="h-3.5 w-3.5" /> Колонки
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="end"
                sideOffset={6}
                className="z-50 w-52 rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border-strong)] shadow-[0_12px_40px_-8px_rgba(0,0,0,0.6)] p-1.5"
              >
                <div className="eyebrow px-2 pb-1.5 pt-1">Видимость</div>
                {table.getAllLeafColumns().map((col) => {
                  // Публичное имя столбца: строковый header или meta.label. Служебные
                  // столбцы без имени (иконка/действия) в списке видимости не показываем.
                  const header = col.columnDef.header
                  const label = (typeof header === 'string' && header) || (col.columnDef.meta as any)?.label
                  if (!label) return null
                  const on = col.getIsVisible()
                  return (
                    <label
                      key={col.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-[13px] text-[var(--text)] hover:bg-[var(--surface-2)]"
                    >
                      <input type="checkbox" checked={on} onChange={col.getToggleVisibilityHandler()} className="sr-only" />
                      <span
                        className={cn(
                          'grid h-[16px] w-[16px] place-items-center rounded-[5px] border transition-colors',
                          on
                            ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]'
                            : 'border-[var(--border-strong)] bg-[var(--surface-2)] text-transparent',
                        )}
                      >
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                      {label}
                    </label>
                  )
                })}
                {/* добавление столбца — здесь же, под списком видимости (канон) */}
                {onAddColumn && (
                  <button
                    onClick={onAddColumn}
                    className="mt-1 flex w-full items-center gap-2 rounded-[var(--radius-sm)] border-t border-[var(--border)] px-2 pb-1 pt-2 text-[13px] text-[var(--muted)] transition-colors hover:text-[var(--accent)]"
                  >
                    <Plus className="h-3.5 w-3.5" /> {addColumnHint}
                  </button>
                )}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </div>
      )}

      {/* таблица: свой ВНУТРЕННИЙ скролл (тело прокручивается, sticky-шапка на месте), не тянет
          страницу (overscroll-contain). fill → скроллер занимает высоту и на мобилке тоже; снизу
          клиренс под плавающее меню, чтобы последние строки доскролливались над ним. */}
      <div ref={scrollerRef} className={cn('overflow-x-auto overscroll-contain', fill && 'min-h-0 flex-1 overflow-y-auto max-lg:pb-[calc(5.5rem+env(safe-area-inset-bottom))]')}>
        {/* border-separate (не collapse): при sticky-заголовке схлопнутые границы «уезжают» при
            скролле и дают шов. С separate границы живут на ячейках и липнут вместе с шапкой. */}
        <table ref={tableRef} className="w-full table-fixed border-separate border-spacing-0 text-[14px]" style={{ minWidth }}>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {rowDragEnabled && <th className="sticky top-0 z-20 w-8 border-b border-[var(--border)] bg-[var(--surface-2)]" />}
                {expandable && <th className="sticky top-0 z-20 w-9 border-b border-[var(--border)] bg-[var(--surface-2)]" />}
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()
                  const align = (header.column.columnDef.meta as any)?.align === 'right'
                  return (
                    <th
                      key={header.id}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      draggable={reorderable || undefined}
                      onDragStart={reorderable ? (e) => { dragCol.current = header.column.id; e.dataTransfer.effectAllowed = 'move' } : undefined}
                      onDragOver={reorderable ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } : undefined}
                      onDrop={reorderable ? (e) => { e.preventDefault(); if (dragCol.current) reorderColumns(dragCol.current, header.column.id); dragCol.current = null } : undefined}
                      style={{ width: (header.column.columnDef.meta as any)?.width }}
                      className={cn(
                        // z-20 обязателен: без него прокручиваемые строки tbody налезают на sticky-заголовок
                        // и визуально «обрезают» его (порядок отрисовки в реальном Chrome).
                        'sticky top-0 z-20 whitespace-nowrap border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[12px] font-medium uppercase tracking-[0.04em] text-[var(--muted)] select-none',
                        align ? 'text-right' : 'text-left',
                        reorderable && 'cursor-grab active:cursor-grabbing',
                        canSort && !reorderable && 'cursor-pointer hover:text-[var(--text)]',
                        canSort && reorderable && 'hover:text-[var(--text)]',
                      )}
                    >
                      {/* Иконка сортировки ВСЕГДА после названия (без flex-row-reverse) — единый вид
                          заголовков и для лево-, и для право-выровненных столбцов. */}
                      <span className="inline-flex items-center gap-1.5">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort &&
                          (sorted === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5 text-[var(--accent)]" />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="h-3.5 w-3.5 text-[var(--accent)]" />
                          ) : (
                            <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                          ))}
                      </span>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {(() => {
              const rows = table.getRowModel().rows
              // Ячейки строки: grip (drag-handle через render-prop) + шеврон + данные
              const renderCells = (row: typeof rows[number], handle?: { attributes: Record<string, unknown>; listeners: Record<string, unknown> | undefined }) => {
                const canExpand = expandable && row.getCanExpand()
                const isOpen = row.getIsExpanded()
                return (<>
                  {rowDragEnabled && (
                    <td className="border-b border-[var(--border)] pl-1.5 pr-0 align-middle">
                      <span {...(handle?.attributes ?? {})} {...(handle?.listeners ?? {})}
                        className="flex cursor-grab touch-none items-center justify-center text-[var(--muted)] opacity-0 transition-opacity hover:text-[var(--accent)] group-hover:opacity-100 active:cursor-grabbing">
                        <GripVertical className="h-4 w-4" />
                      </span>
                    </td>
                  )}
                  {expandable && (
                    <td className="border-b border-[var(--border)] pl-2 pr-0 align-middle">
                      {canExpand && <ChevronRight className={cn('h-4 w-4 text-[var(--muted)] transition-transform', isOpen && 'rotate-90 text-[var(--accent)]')} />}
                    </td>
                  )}
                  {row.getVisibleCells().map((cell) => {
                    const align = (cell.column.columnDef.meta as any)?.align === 'right'
                    return (
                      <td key={cell.id} className={cn('border-b border-[var(--border)] px-3 py-2 text-[var(--text)]', align ? 'mono text-right' : 'text-left')}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    )
                  })}
                </>)
              }

              const body = rows.map((row) => {
                const canExpand = expandable && row.getCanExpand()
                const isOpen = row.getIsExpanded()
                const rid = getRowId ? getRowId(row.original) : row.id
                const active = activeRowId != null && rid === activeRowId
                const rowClass = cn('group transition-colors hover:bg-[var(--surface-2)]/60', (canExpand || onRowClick) && 'cursor-pointer', isOpen && 'bg-[var(--surface-2)]/50', active && 'bg-[var(--accent-soft)]')
                const onClick = onRowClick ? () => onRowClick(row.original) : (canExpand ? row.getToggleExpandedHandler() : undefined)
                const onEnter = onRowMouseEnter ? () => onRowMouseEnter(row.original) : undefined

                if (rowDragEnabled) {
                  return (
                    <SortableRow key={row.id} id={rid} className={rowClass} onClick={onClick as (() => void) | undefined} onMouseEnter={onEnter}>
                      {(handle) => renderCells(row, handle)}
                    </SortableRow>
                  )
                }
                return (
                  <Fragment key={row.id}>
                    <tr className={rowClass} onClick={onClick} onMouseEnter={onEnter}>{renderCells(row)}</tr>
                    {isOpen && renderSubRow && (
                      <tr>
                        <td colSpan={row.getVisibleCells().length + (expandable ? 1 : 0)} className="border-b border-[var(--border)] bg-[var(--surface-2)]/30 p-0">
                          <div className="sticky left-0 overflow-x-auto overscroll-x-contain px-3 py-2.5" style={{ width: viewW || undefined }}>
                            {renderSubRow(row.original)}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })

              if (rowDragEnabled) {
                const activeRow = dragRowId != null ? rows.find((r) => (getRowId ? getRowId(r.original) : r.id) === dragRowId) : undefined
                return (
                  <DndContext sensors={dndSensors} collisionDetection={closestCenter}
                    onDragStart={(e: DragStartEvent) => setDragRowId(e.active.id)}
                    onDragCancel={() => setDragRowId(null)} onDragEnd={handleRowDragEnd}
                    modifiers={[restrictToVerticalAxis, restrictToParentElement]}>
                    <SortableContext items={rows.map((r) => getRowId ? getRowId(r.original) : r.id)} strategy={verticalListSortingStrategy}>
                      {body}
                    </SortableContext>
                    {/* Копия строки летит за курсором и плавно долетает до нового места — без «прыжка» на дропе */}
                    <DragOverlay>
                      {activeRow && (
                        <table className="w-full table-fixed border-separate border-spacing-0 text-[14px]" style={{ width: tableRef.current?.offsetWidth }}>
                          <colgroup>
                            <col style={{ width: 32 }} />
                            {table.getVisibleLeafColumns().map((c) => <col key={c.id} style={{ width: (c.columnDef.meta as any)?.width }} />)}
                          </colgroup>
                          <tbody>
                            <tr className="group cursor-grabbing rounded-[var(--radius)] bg-[var(--surface)] shadow-[0_16px_44px_-8px_rgba(0,0,0,0.55)]">
                              {renderCells(activeRow)}
                            </tr>
                          </tbody>
                        </table>
                      )}
                    </DragOverlay>
                  </DndContext>
                )
              }
              return body
            })()}
          </tbody>
        </table>
      </div>

      {/* hover-«+» добавления строки — аккуратная подвальная строка */}
      {onAddRow && (
        <button
          onClick={onAddRow}
          className="group/addrow flex w-full items-center gap-2 border-t border-[var(--border)] px-3 py-2 text-[13px] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--accent)]"
        >
          <Plus className="h-4 w-4 opacity-60 transition-opacity group-hover/addrow:opacity-100" />
          {addRowLabel}
        </button>
      )}
    </div>
  )
}

/**
 * Ячейка с inline-редактированием по двойному клику.
 * Обе фазы — контейнер одинаковой высоты (h-6) → строка НЕ растёт при правке.
 * Инпут заполняет фиксированную колонку (table-fixed) → таблица НЕ разъезжается.
 */
export function EditableCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  // Обе фазы — ОДИНАКОВЫЙ бокс (h-6, px-1.5, рамка 1px): в display рамка прозрачная,
  // в edit — акцентная. Текст не смещается, поле «формируется вокруг».
  const box = 'block h-6 w-full truncate rounded-[6px] border px-1.5 text-[14px] leading-6'
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { onChange(draft); setEditing(false) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { onChange(draft); setEditing(false) }
          if (e.key === 'Escape') { setDraft(value); setEditing(false) }
        }}
        className={cn(box, 'border-[var(--accent)] bg-[var(--surface-3)] text-[var(--text)] outline-none')}
      />
    )
  }
  return (
    <span
      onClick={() => { if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) { setDraft(value); setEditing(true) } }}
      onDoubleClick={() => { setDraft(value); setEditing(true) }}
      title="Двойной клик — редактировать"
      className={cn(box, 'cursor-text border-transparent hover:bg-[var(--surface-3)]')}
    >
      {value}
    </span>
  )
}
