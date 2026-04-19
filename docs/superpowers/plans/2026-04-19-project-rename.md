# Project Rename & UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename "матрица" → "проект" in all UI, change `unit` field to multi-select (`TEXT[]`), fix project card header and description block, add inline status editing in card.

**Architecture:** DB migration converts `unit String?` → `String[]`. Backend route updated to handle arrays and harden status (always `request` on create). Frontend has a new `MultiSelect` component; `RegistryDetailModal` holds local entry state so status edits reflect immediately in header without closing the modal.

**Tech Stack:** Prisma (PostgreSQL), Fastify, React + TanStack Query, inline styles

---

## Files

| File | Change |
|------|--------|
| `packages/db/prisma/schema.prisma` | `unit String[]` |
| `packages/db/prisma/migrations/<new>/migration.sql` | Custom SQL with USING clause |
| `apps/api/src/routes/internalMatrix.ts` | unit array, name format, status hardcode |
| `apps/web/src/pages/SyncDataPage.tsx` | All UI changes |

---

## Task 1: DB Migration — unit String → String[]

**Files:**
- Modify: `packages/db/prisma/schema.prisma` line ~180
- Create: `packages/db/prisma/migrations/<timestamp>_unit_to_array/migration.sql`

- [ ] **Step 1: Update schema**

In `packages/db/prisma/schema.prisma`, find the `MatrixRegistry` model and change:

```prisma
// Before:
unit         String?

// After:
unit         String[]  @default([])
```

- [ ] **Step 2: Create migration file only (don't apply yet)**

```bash
cd "d:/Pet projects/scripts/PlanOtchetGlot/packages/db"
npx prisma migrate dev --create-only --name unit_to_array
```

Expected: Prisma creates `prisma/migrations/<timestamp>_unit_to_array/migration.sql`.

- [ ] **Step 3: Replace migration SQL with safe USING-clause version**

Open the generated `migration.sql`. Prisma likely generated a DROP + ADD pattern. Replace the entire content with:

```sql
ALTER TABLE "matrix_registry"
  ALTER COLUMN "unit" TYPE TEXT[]
  USING CASE
    WHEN "unit" IS NULL OR "unit" = '' THEN ARRAY[]::TEXT[]
    ELSE ARRAY["unit"]
  END;

ALTER TABLE "matrix_registry"
  ALTER COLUMN "unit" SET DEFAULT '{}';

ALTER TABLE "matrix_registry"
  ALTER COLUMN "unit" SET NOT NULL;
```

- [ ] **Step 4: Apply the migration**

If the API server is NOT running:
```bash
cd "d:/Pet projects/scripts/PlanOtchetGlot/packages/db"
npx prisma migrate dev
```

If the API server IS running (locks the DLL), stop it first or run:
```bash
cd "d:/Pet projects/scripts/PlanOtchetGlot/packages/db"
DATABASE_URL="$(grep DATABASE_URL ../../../.env | cut -d= -f2-)" npx prisma migrate dev --skip-generate
```

Expected output: `✓ Generated Prisma Client` (or skipped) and `The following migration(s) have been applied: unit_to_array`.

- [ ] **Step 5: Regenerate Prisma client (if --skip-generate was used)**

```bash
cd "d:/Pet projects/scripts/PlanOtchetGlot"
pnpm db:generate
```

- [ ] **Step 6: Verify column type**

```bash
cd "d:/Pet projects/scripts/PlanOtchetGlot/packages/db"
DATABASE_URL="$(grep DATABASE_URL ../../../.env | cut -d= -f2-)" npx prisma db execute --stdin <<'SQL'
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'matrix_registry' AND column_name = 'unit';
SQL
```

Expected: `data_type = ARRAY`, `udt_name = _text`.

- [ ] **Step 7: Commit**

```bash
cd "d:/Pet projects/scripts/PlanOtchetGlot"
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "feat(db): migrate unit field from String to String[]"
```

---

## Task 2: Backend — Update internalMatrix Route

**Files:**
- Modify: `apps/api/src/routes/internalMatrix.ts`

- [ ] **Step 1: Update `MatrixRow` interface — unit becomes string[]**

Find the `interface MatrixRow` block and change `unit: string | null` to `unit: string[]`:

```typescript
interface MatrixRow {
  id: string
  matrix_id: string
  sheet_url: string | null
  status: string | null
  unit: string[]           // was: string | null
  client: string | null
  name: string | null
  format: string | null
  date: Date | null
  producer: string | null
  manager: string | null
  curator: string | null
  project_name: string | null
  kp_link: string | null
  brief: string | null
  source: string
  template_id: string | null
  created_at: Date
  updated_at: Date
}
```

- [ ] **Step 2: Update Zod schema — unit becomes string array, remove status**

Replace the `createMatrixSchema` at the top of the file:

```typescript
const createMatrixSchema = z.object({
  projectName:  z.string().nullable().optional(),
  client:       z.string().nullable().optional(),
  unit:         z.array(z.string()).optional().default([]),
  format:       z.string().nullable().optional(),
  date:         z.string().nullable().optional(),
  producer:     z.string().nullable().optional(),
  manager:      z.string().nullable().optional(),
  curator:      z.string().nullable().optional(),
  kpLink:       z.string().nullable().optional(),
  brief:        z.string().nullable().optional(),
  status:       z.string().nullable().optional(), // still accepted on PATCH for status update
  templateId:   z.string().uuid().nullable().optional(),
})
```

- [ ] **Step 3: Update POST handler — name format, hardcode status, array unit**

Replace the POST handler body (inside `app.post('/', ...)`) — find the `name = ...` line and the INSERT block:

```typescript
// Name is now just "client — projectName" (no version, no date)
const name = [client, projectName].filter(Boolean).join(' — ') || projectName || matrixId

const rows = await prisma.$queryRawUnsafe<MatrixRow[]>(
  `INSERT INTO matrix_registry
     (id, matrix_id, name, client, unit, format, date, producer, manager, curator,
      project_name, kp_link, brief, status, source, template_id, sheet_url, updated_at)
   VALUES
     (gen_random_uuid(), $1, $2, $3, $4::TEXT[], $5, $6, $7, $8, $9,
      $10, $11, $12, 'request', 'internal', $13, NULL, NOW())
   RETURNING *`,
  matrixId, name,
  client ?? null, unit ?? [],
  format ?? null,
  date ? new Date(date) : null,
  producer ?? null, manager ?? null, curator ?? null,
  projectName ?? null, kpLink ?? null, brief ?? null,
  resolvedTemplateId,
)
```

Note: status is hardcoded to `'request'` — the `status` field from body is intentionally ignored on create.

- [ ] **Step 4: Update PATCH handler — handle unit array**

Find the `map` object in the PATCH handler. Add special handling for `unit`. Replace the for-loop block:

```typescript
for (const [key, col] of Object.entries(map)) {
  if ((body.data as any)[key] !== undefined) {
    if (key === 'unit') {
      sets.push(`unit = $${i++}::TEXT[]`)
      vals.push((body.data as any).unit ?? [])
    } else {
      const val = key === 'date' && (body.data as any)[key]
        ? new Date((body.data as any)[key])
        : (body.data as any)[key] ?? null
      sets.push(`${col} = $${i++}`)
      vals.push(val)
    }
  }
}
```

- [ ] **Step 5: Update Drive sync call — join unit array for Drive**

In `sync-to-drive` handler, find the `writeSvodData` call and update `businessUnit`:

```typescript
// Before:
businessUnit:  matrix.unit ?? null,

// After:
businessUnit:  matrix.unit?.length ? matrix.unit.join(', ') : null,
```

- [ ] **Step 6: Fix error message (матрица → проект)**

Find the line:
```typescript
if (data?.driveError) setError(`Матрица создана, но ошибка Drive: ${data.driveError}`)
```
This is in the frontend — skip for now (handled in Task 4). In the backend, find any "Матрица не найдена" strings and leave them (backend messages are not shown to end users in this app).

- [ ] **Step 7: Build backend to verify no type errors**

```bash
cd "d:/Pet projects/scripts/PlanOtchetGlot"
pnpm --filter @tv-shifts/api build
```

Expected: no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/internalMatrix.ts
git commit -m "feat(api): unit as TEXT[], name without version, status hardcoded to request on create"
```

---

## Task 3: Frontend — RegistryEntry Type + MultiSelect Component

**Files:**
- Modify: `apps/web/src/pages/SyncDataPage.tsx` (top section + new component)

- [ ] **Step 1: Update `RegistryEntry` interface — unit becomes string[]**

Find `interface RegistryEntry` (~line 33) and change:
```typescript
// Before:
unit: string | null

// After:
unit: string[]
```

- [ ] **Step 2: Add `MultiSelect` component at module level**

Add this component **before** the `MatrixFormModal` function (around line 2435, after other module-level helpers). Place it at module scope (not inside another component):

```typescript
// ─── MultiSelect ──────────────────────────────────────────────────────────────

function MultiSelect({
  label, options, value, onChange,
}: {
  label: string
  options: string[]
  value: string[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = (opt: string) => {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt])
  }

  const ls: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4,
  }
  const triggerStyle: React.CSSProperties = {
    width: '100%', fontSize: 13, padding: '7px 10px', border: '1px solid #e2e8f0',
    borderRadius: 6, outline: 'none', color: value.length ? '#1e293b' : '#94a3b8',
    background: '#f8fafc', boxSizing: 'border-box', cursor: 'pointer',
    textAlign: 'left', fontFamily: 'inherit',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }} ref={ref}>
      <div style={ls}>{label}</div>
      <button type="button" style={triggerStyle} onClick={() => setOpen((o) => !o)}>
        {value.length === 0 ? '— не выбрано —' : value.join(', ')}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)', maxHeight: 200, overflowY: 'auto', marginTop: 2,
        }}>
          {options.map((opt) => (
            <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 13, color: '#1e293b' }}>
              <input type="checkbox" checked={value.includes(opt)} onChange={() => toggle(opt)} style={{ cursor: 'pointer' }} />
              {opt}
            </label>
          ))}
          {options.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 13, color: '#94a3b8' }}>Нет вариантов</div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Check TypeScript compiles with no errors**

```bash
cd "d:/Pet projects/scripts/PlanOtchetGlot"
pnpm --filter @tv-shifts/web exec tsc --noEmit
```

Fix any errors about `unit` type mismatch (e.g. places that call `.toLowerCase()` or treat it as `string`).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/SyncDataPage.tsx
git commit -m "feat(web): update RegistryEntry.unit to string[], add MultiSelect component"
```

---

## Task 4: Frontend — MatrixFormModal UX Changes

**Files:**
- Modify: `apps/web/src/pages/SyncDataPage.tsx` (`MatrixFormModal` function, ~lines 2435–2608)

- [ ] **Step 1: Update form state — unit becomes string[]**

Find the `useState({...})` inside `MatrixFormModal`. Change:
```typescript
// Before:
unit:        matrix?.unit       ?? '',

// After:
unit:        matrix?.unit       ?? [],
```

- [ ] **Step 2: Update save body — unit sends array**

Find the `body` object inside `save.mutationFn`. Change:
```typescript
// Before:
unit:        form.unit.trim()        || null,

// After:
unit:        form.unit,
```

- [ ] **Step 3: Remove name preview block**

Find and delete the following block (the "Auto-generated name preview" block, ~line 2556–2561):
```typescript
{/* Auto-generated name preview */}
{!isEdit && (
  <div style={{ fontSize: 12, color: '#64748b', background: '#f1f5f9', padding: '8px 12px', borderRadius: 6, fontStyle: 'italic' }}>
    {namePreview}
  </div>
)}
```

Also delete the `namePreview` and `datePreview` variable declarations above the `return` statement:
```typescript
// Delete these two lines:
const datePreview = form.date
  ? form.date.replace(/-/g, ' ')
  : new Date().toISOString().slice(0, 10).replace(/-/g, ' ')
const namePreview = `Матрица v4.1: ${form.client || '…'}: ${form.projectName || '…'}: ${datePreview}`
```

- [ ] **Step 4: Add static status badge at top of form, before other fields**

Find the opening of the scrollable content `<div style={{ overflowY: 'auto', padding: '16px 20px', flex: 1, ...}}>` and add the status badge as the first child:

```typescript
{/* Status badge — read-only */}
<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
  <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Статус</span>
  <span style={{
    padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
    background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
  }}>
    {STATUS_LABELS[isEdit ? (matrix?.status ?? 'request') : 'request'] ?? 'Запрос'}
  </span>
</div>
```

- [ ] **Step 5: Remove status select from bottom of form**

Find and delete:
```typescript
{fsel('Статус', 'status', statuses)}
```

Also delete the `statuses` variable if it's no longer used:
```typescript
// Delete this line:
const statuses   = kfpdCol(8)
```

And remove `status` from the form state and save body entirely:
- Remove `status: matrix?.status ?? ''` from `useState`
- Remove `status: form.status.trim() || null` from save body

- [ ] **Step 6: Replace unit single-select with MultiSelect**

Find:
```typescript
{fsel('Бизнес Юнит', 'unit', bizUnits)}
```

Replace with:
```typescript
<MultiSelect
  label="Бизнес Юнит"
  options={bizUnits}
  value={form.unit}
  onChange={(v) => setForm((f) => ({ ...f, unit: v }))}
/>
```

- [ ] **Step 7: Rename form modal titles**

Find:
```typescript
<div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{isEdit ? 'Редактировать матрицу' : 'Новая матрица'}</div>
```

Replace:
```typescript
<div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{isEdit ? 'Редактировать проект' : 'Новый проект'}</div>
```

- [ ] **Step 8: Fix Drive error message string**

Find:
```typescript
if (data?.driveError) setError(`Матрица создана, но ошибка Drive: ${data.driveError}`)
```

Replace:
```typescript
if (data?.driveError) setError(`Проект создан, но ошибка Drive: ${data.driveError}`)
```

- [ ] **Step 9: TypeScript check**

```bash
pnpm --filter @tv-shifts/web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/pages/SyncDataPage.tsx
git commit -m "feat(web): MatrixFormModal — status badge, multi-select unit, remove name preview, rename to Проект"
```

---

## Task 5: Frontend — Table Label Renames

**Files:**
- Modify: `apps/web/src/pages/SyncDataPage.tsx` (RegistryTable section, ~lines 2800–2842 and filter settings ~line 409)

- [ ] **Step 1: Rename section header "Реестр матриц" → "Реестр проектов"** (line ~2807)

```typescript
// Before:
Реестр матриц

// After:
Реестр проектов
```

- [ ] **Step 2: Rename filter settings label** (line ~409)

```typescript
// Before:
<span style={settingsSectionTitle}>Фильтры — Реестр матриц</span>

// After:
<span style={settingsSectionTitle}>Фильтры — Реестр проектов</span>
```

- [ ] **Step 3: Rename "Создать матрицу" button** (line ~2840)

```typescript
// Before:
+ Создать матрицу

// After:
+ Создать проект
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/SyncDataPage.tsx
git commit -m "feat(web): rename Реестр матриц → Реестр проектов, Создать матрицу → Создать проект"
```

---

## Task 6: Frontend — RegistryDetailModal Header Fix

**Files:**
- Modify: `apps/web/src/pages/SyncDataPage.tsx` (`RegistryDetailModal` function, ~lines 1895–2090)

- [ ] **Step 1: Add local entry state to RegistryDetailModal**

Inside `RegistryDetailModal`, right after the function signature, add local state that will be updated when status changes in the Info tab:

```typescript
const [localEntry, setLocalEntry] = useState<RegistryEntry>(entry)
```

Replace all usages of `entry` within the modal with `localEntry` — **except** the initial prop. The key references to update:
- `localEntry.source` (was `entry.source`)
- `localEntry.status` (was `entry.status`)
- `localEntry.name` (was `entry.name`) — and will be replaced in next step
- `localEntry.client` (was `entry.client`)
- `localEntry.matrixId` (was `entry.matrixId`)
- All props passed to `RegistryInfoTab` and `InternalShiftsPanel`

**Important:** The `useQuery` calls inside the modal use `entry.matrixId` / `entry.id` as query keys — these should stay as the original `entry` value (they're stable for the lifetime of the modal).

Simplest approach: rename `entry` to `localEntry` at the start by destructuring:
```typescript
// Right after: const [localEntry, setLocalEntry] = useState<RegistryEntry>(entry)
// Use localEntry everywhere inside the render. The prop `entry` is only used to initialize.
```

- [ ] **Step 2: Fix big title in header — use projectName**

Find the big title line inside the header (line ~2009):
```typescript
<div style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name ?? entry.matrixId}</div>
```

Replace with:
```typescript
<div style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
  {localEntry.projectName ?? localEntry.name ?? localEntry.matrixId}
</div>
```

- [ ] **Step 3: Update status display in header to use localEntry**

Find the status badge in the header:
```typescript
const statusStyle = entry.status ? (statusColors[entry.status] ?? { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' }) : null
```

Replace `entry.status` with `localEntry.status` here and in the badge JSX.

- [ ] **Step 4: Pass onStatusChanged callback to RegistryInfoTab**

Find where `RegistryInfoTab` is rendered:
```typescript
<RegistryInfoTab entry={entry} ganttTasks={ganttTasks} />
```

Replace with:
```typescript
<RegistryInfoTab
  entry={localEntry}
  ganttTasks={ganttTasks}
  onStatusChanged={(newStatus) => setLocalEntry((prev) => ({ ...prev, status: newStatus }))}
/>
```

- [ ] **Step 5: TypeScript check**

```bash
pnpm --filter @tv-shifts/web exec tsc --noEmit
```

Fix any errors (likely `onStatusChanged` prop missing from `RegistryInfoTab` type — will be added in Task 7).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/SyncDataPage.tsx
git commit -m "feat(web): RegistryDetailModal — show projectName in header, local entry state for live status updates"
```

---

## Task 7: Frontend — RegistryInfoTab Description Block + Team Labels

**Files:**
- Modify: `apps/web/src/pages/SyncDataPage.tsx` (`RegistryInfoTab` function, ~lines 1487–1700)

- [ ] **Step 1: Add `onStatusChanged` prop to RegistryInfoTab**

Find the function signature:
```typescript
function RegistryInfoTab({ entry, ganttTasks }: { entry: RegistryEntry; ganttTasks?: GanttTaskInfo[] }) {
```

Replace:
```typescript
function RegistryInfoTab({
  entry, ganttTasks, onStatusChanged,
}: {
  entry: RegistryEntry
  ganttTasks?: GanttTaskInfo[]
  onStatusChanged?: (newStatus: string) => void
}) {
```

- [ ] **Step 2: Add queryClient and status mutation inside RegistryInfoTab**

After the existing `useQuery`/`useQueries` calls inside `RegistryInfoTab`, add:

```typescript
const qc = useQueryClient()

const updateStatus = useMutation({
  mutationFn: (newStatus: string) =>
    api.patch(`/internal-matrix/${entry.id}`, { status: newStatus }).then((r) => r.data),
  onSuccess: (_data, newStatus) => {
    qc.invalidateQueries({ queryKey: ['internal-matrix'] })
    onStatusChanged?.(newStatus)
  },
})

const [briefText, setBriefText] = useState(entry.brief ?? '')
const [briefDirty, setBriefDirty] = useState(false)

const saveBrief = useMutation({
  mutationFn: () =>
    api.patch(`/internal-matrix/${entry.id}`, { brief: briefText }).then((r) => r.data),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['internal-matrix'] })
    setBriefDirty(false)
  },
})
```

- [ ] **Step 3: Replace description block content**

Find the `{/* Описание */}` block (~line 1661–1681). The current content is:
```typescript
<div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', flex: 1 }}>
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
    {([
      { label: 'Название', value: entry.name },
      { label: 'Клиент',   value: entry.client },
    ] as { label: string; value: string | null | undefined }[]).map(({ label, value }) => (
      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>
        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>{label}</span>
        <span style={{ fontSize: 13, color: value ? '#1e293b' : '#cbd5e1' }}>{value || '—'}</span>
      </div>
    ))}
  </div>
  <textarea
    defaultValue={entry.brief ?? ''}
    placeholder="Введите описание проекта…"
    style={{ flex: 1, minHeight: 80, border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#1e293b', fontFamily: 'inherit', resize: 'none', outline: 'none', lineHeight: 1.6, background: '#fff' }}
  />
</div>
```

Replace the entire inner content with:
```typescript
<div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', flex: 1, gap: 10 }}>

  {/* Ссылка на КП */}
  {entry.kpLink && (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>Ссылка на КП</span>
      <a href={entry.kpLink} target="_blank" rel="noopener noreferrer"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 20, padding: '3px 10px 3px 7px', color: '#2563eb', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>
        <span style={{ fontSize: 13 }}>📄</span> КП <span style={{ opacity: 0.6, fontSize: 10 }}>↗</span>
      </a>
    </div>
  )}

  {/* Статус (только для внутренних) */}
  {entry.source === 'internal' && (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>Статус</span>
      <select
        value={entry.status ?? ''}
        onChange={(e) => { if (e.target.value) updateStatus.mutate(e.target.value) }}
        disabled={updateStatus.isPending}
        style={{ fontSize: 12, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, color: '#1e293b', background: '#f8fafc', cursor: 'pointer', outline: 'none' }}
      >
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <option key={key} value={key}>{label}</option>
        ))}
      </select>
    </div>
  )}

  {/* Бриф / описание */}
  <textarea
    value={briefText}
    onChange={(e) => { setBriefText(e.target.value); setBriefDirty(true) }}
    placeholder="Введите описание проекта…"
    style={{ flex: 1, minHeight: 80, border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#1e293b', fontFamily: 'inherit', resize: 'none', outline: 'none', lineHeight: 1.6, background: '#fff' }}
  />
  {briefDirty && (
    <button
      onClick={() => saveBrief.mutate()}
      disabled={saveBrief.isPending}
      style={{ alignSelf: 'flex-end', fontSize: 12, padding: '5px 14px', borderRadius: 6, border: 'none', background: saveBrief.isPending ? '#93c5fd' : '#2563eb', color: '#fff', cursor: saveBrief.isPending ? 'default' : 'pointer', fontWeight: 500 }}
    >
      {saveBrief.isPending ? 'Сохраняю...' : 'Сохранить'}
    </button>
  )}

</div>
```

- [ ] **Step 4: Rename team block labels**

Find the team block (~line 1613–1615):
```typescript
<div style={{ ...fRow, borderBottom: '1px solid #f8fafc' }}><span style={fLbl}>Продюсер</span><span style={fVal}>{entry.producer || '—'}</span></div>
<div style={{ ...fRow, borderBottom: '1px solid #f8fafc' }}><span style={fLbl}>Менеджер</span><span style={fVal}>{entry.manager || '—'}</span></div>
<div style={{ ...fRow, borderBottom: 'none' }}><span style={fLbl}>Куратор</span><span style={fVal}>{entry.curator || '—'}</span></div>
```

Replace:
```typescript
<div style={{ ...fRow, borderBottom: '1px solid #f8fafc' }}><span style={fLbl}>Продюсер от ММ</span><span style={fVal}>{entry.producer || '—'}</span></div>
<div style={{ ...fRow, borderBottom: '1px solid #f8fafc' }}><span style={fLbl}>Менеджер по продажам</span><span style={fVal}>{entry.manager || '—'}</span></div>
<div style={{ ...fRow, borderBottom: 'none' }}><span style={fLbl}>Куратор от заказчика</span><span style={fVal}>{entry.curator || '—'}</span></div>
```

- [ ] **Step 5: TypeScript check**

```bash
pnpm --filter @tv-shifts/web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/SyncDataPage.tsx
git commit -m "feat(web): RegistryInfoTab — inline status edit, KP link, brief save, team label renames"
```

---

## Task 8: Final Check & Cleanup

- [ ] **Step 1: Run full TypeScript check on both packages**

```bash
cd "d:/Pet projects/scripts/PlanOtchetGlot"
pnpm --filter @tv-shifts/web exec tsc --noEmit
pnpm --filter @tv-shifts/api build
```

Both must complete with no errors.

- [ ] **Step 2: Verify unit display in RegistryTable**

Check if there are any places in `RegistryTable` that render `entry.unit` as a string (e.g. in column rendering). Since `unit` is now `string[]`, any `.toLowerCase()` or string interpolation will be broken. Search:

```bash
grep -n "entry\.unit\|r\.unit\|\.unit" apps/web/src/pages/SyncDataPage.tsx
```

Fix column display (two locations):

Line ~2422 — sort key for column filter:
```typescript
// Before:
case 'unit':   return r.unit ?? ''
// After:
case 'unit':   return Array.isArray(r.unit) ? r.unit.join(', ') : ''
```

Line ~2788 — cell render in registry table:
```typescript
// Before:
case 'unit':     return r.unit ?? '—'
// After:
case 'unit':     return Array.isArray(r.unit) && r.unit.length ? r.unit.join(', ') : '—'
```

Fix filter options (two locations):

Line ~2724 — project table filter options:
```typescript
// Before:
unit:   uniq(afterPrimary.map((r) => r.unit)),
// After:
unit:   uniq(afterPrimary.flatMap((r) => r.unit)),
```

Line ~3020 — registry table filter options:
```typescript
// Before:
unit:   uniq(registry.map((r) => r.unit)),
// After:
unit:   uniq(registry.flatMap((r) => r.unit)),
```

- [ ] **Step 3: TypeScript check again after cleanup**

```bash
pnpm --filter @tv-shifts/web exec tsc --noEmit
```

- [ ] **Step 4: Start dev servers and smoke test**

```bash
cd "d:/Pet projects/scripts/PlanOtchetGlot"
pnpm dev
```

Open http://localhost:5173. Log in as admin. Go to "Данные синхронизации" → "Реестр проектов" tab.

Smoke test checklist:
- [ ] Section header shows "Реестр проектов" (not "Реестр матриц")
- [ ] Button shows "+ Создать проект"
- [ ] Click "+ Создать проект" → modal title is "Новый проект"
- [ ] Status badge at top of form shows "Запрос" (non-clickable)
- [ ] No name preview block shown
- [ ] Бизнес Юнит shows a custom dropdown with checkboxes; can select multiple
- [ ] Create a project → it appears in the list
- [ ] Click on a project → card header shows `projectName` (not "Матрица v4.1:…")
- [ ] Info tab → Description block has no "Название" / "Клиент" rows
- [ ] If project has kpLink → clickable КП link appears
- [ ] Status select appears for internal projects; changing it updates header badge
- [ ] Team block shows "Продюсер от ММ", "Менеджер по продажам", "Куратор от заказчика"
- [ ] Brief textarea is editable; save button appears after typing; saves correctly

- [ ] **Step 5: Final commit**

```bash
git add apps/web/src/pages/SyncDataPage.tsx
git commit -m "fix(web): unit array handling in filters and column display"
```
