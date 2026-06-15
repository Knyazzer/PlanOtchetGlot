# -*- coding: utf-8 -*-
"""
ETL фаза 1: извлечение из дампа донора (SQLite kv) в JSON.
Источник истины задач — слой pr_v2_* (legacy pr_e_*.tasks мигрированы туда же, дедуп не нужен).
Дни берём из pr_e_* (формат+время), задачи внутри дней игнорируем.
Запуск:  python scripts/etl/extract.py [путь_к_дампу]
Выход:   scripts/etl/out/*.json
"""
import sqlite3, json, sys, re, collections
from pathlib import Path

DUMP = sys.argv[1] if len(sys.argv) > 1 else r'c:\scripts\planotchet\pr_data_migrated_2026-05-24.db'
OUT = Path(__file__).parent / 'out'
OUT.mkdir(exist_ok=True)

# Источник: SQLite-дамп (.db) ИЛИ JSON-снапшот GET /api.php (универсален для MySQL-прода донора)
if DUMP.lower().endswith('.json'):
    _snap = json.loads(Path(DUMP).read_text(encoding='utf-8'))
    # снапшот может быть {key: valueString} или {key: value}
    _kv = {k: (v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)) for k, v in _snap.items()}
    class _JsonCursor:
        def execute(self, sql, params=None):
            self._sql, self._params = sql, params
            return self
        def fetchone(self):
            key = self._params[0]
            return (_kv[key],) if key in _kv else None
        def __iter__(self):
            # поддержка: SELECT key, value FROM kv WHERE key LIKE 'prefix%'
            like = self._sql.split("LIKE '")[1].split("'")[0].replace('%', '')
            return iter([(k, v) for k, v in _kv.items() if k.startswith(like)])
    c = _JsonCursor()
else:
    db = sqlite3.connect(DUMP)
    c = db.cursor()

def get(key):
    row = c.execute('SELECT value FROM kv WHERE key=?', (key,)).fetchone()
    return json.loads(row[0]) if row else None

def dump(name, data):
    (OUT / f'{name}.json').write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'{name}: {len(data)}')

# ── Структура ──────────────────────────────────────────────────────────────────
departments = get('pr_v2_departments') or []   # {id(slug), name}
divisions   = get('pr_v2_divisions') or []     # {id(slug), name, departmentId, departmentName}
employees   = get('pr_v2_employees') or []     # {id(S017), name, divisionId, departmentId, ...}
dump('departments', departments)
dump('divisions', divisions)
dump('employees', employees)

# ── Проекты (+решение П-5: хвост с 1 задачей → архив done) ────────────────────
projects = get('pr_v2_projects') or []
tasks    = get('pr_v2_tasks') or []
proj_task_count = collections.Counter(t.get('projectId') for t in tasks if t.get('projectId'))
for p in projects:
    p['taskCount'] = proj_task_count.get(p['id'], 0)
dump('projects', projects)

# ── Задачи ─────────────────────────────────────────────────────────────────────
TYPE_MAP = {
    'Задача': 'task', 'Zoom встреча': 'zoom', 'Встреча оффлайн': 'meeting_offline',
    'Эфир': 'air', 'Застройка': 'build', 'Мероприятие': 'event',
}
out_tasks = []
for t in tasks:
    if not t.get('assigneeId') or not t.get('date'):
        continue  # 4 задачи без исполнителя/даты — мусор миграции донора
    out_tasks.append({
        'legacyId': t['id'],
        'title': (t.get('title') or '(без названия)').strip()[:500],
        'type': TYPE_MAP.get((t.get('type') or '').strip(), 'task'),
        'client': (t.get('client') or '').strip() or None,
        'donorProjectId': t.get('projectId') or None,
        'assigneeEmpId': t['assigneeId'],
        'donorDivisionId': t.get('departmentId') or None,  # у донора это слаг отдела
        'date': t['date'],
        'deadline': t.get('dueDate') or None,
        'plannedMinutes': t.get('plannedMinutes') or None,
        'actualMinutes': t.get('actualMinutes') or None,
        'done': bool(t.get('done')),
        'doneAt': t.get('doneAt') or None,
        'description': (t.get('description') or '').strip(),
    })
dump('tasks', out_tasks)

# ── Дни (pr_e_*) ───────────────────────────────────────────────────────────────
KEY_RE = re.compile(r'^pr_e_(.+)_(\d{4}-\d{2}-\d{2})_([^_]+)$')
FORMAT_ALIASES = {'timeoff': 'dayoff'}  # рудимент донора
days = []
skipped_empty = 0
for (key, value) in c.execute("SELECT key, value FROM kv WHERE key LIKE 'pr_e_%'"):
    m = KEY_RE.match(key)
    if not m:
        continue
    div_slug, date, emp = m.groups()
    try:
        d = json.loads(value)
    except Exception:
        continue
    if not isinstance(d, dict):
        continue
    fmt = (d.get('dayFormat') or '').strip()
    fmt = FORMAT_ALIASES.get(fmt, fmt)
    if not fmt:
        skipped_empty += 1
        continue  # пустые заготовки дней — не переносим
    days.append({
        'empId': emp,
        'donorDivisionSlug': div_slug,
        'date': date,
        'dayFormat': fmt,
        'startTime': d.get('startTime') or None,
        'endTime': d.get('endTime') or None,
        'breakMin': int(d.get('breakMin') or 0),
    })
dump('day_entries', days)
print(f'  (пропущено пустых дней: {skipped_empty})')

# ── Личные колонки (pr_kb_*) ───────────────────────────────────────────────────
DEFAULT_COLS = {'todo', 'done'}
cols = []
for (key, value) in c.execute("SELECT key, value FROM kv WHERE key LIKE 'pr_kb_%'"):
    emp = key.replace('pr_kb_', '')
    try:
        arr = json.loads(value)
    except Exception:
        continue
    if not isinstance(arr, list):
        continue
    order = 0
    for col in arr:
        if not isinstance(col, dict):
            continue
        if col.get('id') in DEFAULT_COLS:
            continue  # дефолтные «Запланировано/Выполнено» не переносим
        name = (col.get('name') or '').strip()
        if not name:
            continue
        cols.append({'empId': emp, 'name': name, 'order': order})
        order += 1
dump('board_columns', cols)

print('OK →', OUT)
