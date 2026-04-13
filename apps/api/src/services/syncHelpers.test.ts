import { describe, it, expect } from 'vitest'
import {
  extractSpreadsheetId,
  bgHexOrNull,
  fgHexOrNull,
  getCellColor,
  evalConditionalColor,
  isColored,
  cellStr,
  serialToDate,
  parseSheetDate,
  parseProjectStatus,
  parseEmploymentType,
  isStaffType,
} from './syncHelpers'

// ─── extractSpreadsheetId ─────────────────────────────────────────────────────

describe('extractSpreadsheetId', () => {
  it('полный URL с /edit → правильный ID', () => {
    expect(extractSpreadsheetId(
      'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit#gid=0'
    )).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms')
  })

  it('URL без /edit → правильный ID', () => {
    expect(extractSpreadsheetId(
      'https://docs.google.com/spreadsheets/d/ABC123-_xyz'
    )).toBe('ABC123-_xyz')
  })

  it('пустая строка → null', () => {
    expect(extractSpreadsheetId('')).toBeNull()
  })

  it('не-URL строка → null', () => {
    expect(extractSpreadsheetId('просто текст')).toBeNull()
  })

  it('ID матрицы без URL → null', () => {
    expect(extractSpreadsheetId('ТВ2632550')).toBeNull()
  })
})

// ─── bgHexOrNull ──────────────────────────────────────────────────────────────

describe('bgHexOrNull', () => {
  it('null → null', () => {
    expect(bgHexOrNull(null)).toBeNull()
  })

  it('undefined → null', () => {
    expect(bgHexOrNull(undefined)).toBeNull()
  })

  it('белый {r:1,g:1,b:1} → null', () => {
    expect(bgHexOrNull({ red: 1, green: 1, blue: 1 })).toBeNull()
  })

  it('почти белый (все каналы ≥ 252/255) → null', () => {
    const almost = 252 / 255
    expect(bgHexOrNull({ red: almost, green: almost, blue: almost })).toBeNull()
  })

  it('пустой объект (дефолтные каналы = 1) → null', () => {
    expect(bgHexOrNull({})).toBeNull()
  })

  it('жёлтый {r:1,g:1,b:0} → #ffff00', () => {
    expect(bgHexOrNull({ red: 1, green: 1, blue: 0 })).toBe('#ffff00')
  })

  it('красный {r:1,g:0,b:0} → #ff0000', () => {
    expect(bgHexOrNull({ red: 1, green: 0, blue: 0 })).toBe('#ff0000')
  })

  it('чёрный {r:0,g:0,b:0} → #000000', () => {
    expect(bgHexOrNull({ red: 0, green: 0, blue: 0 })).toBe('#000000')
  })

  it('произвольный цвет → правильный hex', () => {
    // r=0.5→128, g=0.25→64, b=0.75→191
    const result = bgHexOrNull({ red: 0.5, green: 0.25, blue: 0.75 })
    expect(result).toMatch(/^#[0-9a-f]{6}$/)
  })
})

// ─── fgHexOrNull ──────────────────────────────────────────────────────────────

describe('fgHexOrNull', () => {
  it('null → null', () => {
    expect(fgHexOrNull(null)).toBeNull()
  })

  it('чёрный {r:0,g:0,b:0} → null', () => {
    expect(fgHexOrNull({ red: 0, green: 0, blue: 0 })).toBeNull()
  })

  it('почти чёрный (все ≤ 30/255) → null', () => {
    const dark = 30 / 255
    expect(fgHexOrNull({ red: dark, green: dark, blue: dark })).toBeNull()
  })

  it('пустой объект (дефолтные каналы = 0) → null', () => {
    expect(fgHexOrNull({})).toBeNull()
  })

  it('белый {r:1,g:1,b:1} → #ffffff', () => {
    expect(fgHexOrNull({ red: 1, green: 1, blue: 1 })).toBe('#ffffff')
  })

  it('синий {r:0,g:0,b:1} → #0000ff', () => {
    expect(fgHexOrNull({ red: 0, green: 0, blue: 1 })).toBe('#0000ff')
  })
})

// ─── getCellColor ─────────────────────────────────────────────────────────────

describe('getCellColor', () => {
  it('null/undefined ячейка → null', () => {
    expect(getCellColor(null)).toBeNull()
    expect(getCellColor(undefined)).toBeNull()
  })

  it('ячейка без форматирования → null', () => {
    expect(getCellColor({})).toBeNull()
  })

  it('белый фон → null', () => {
    expect(getCellColor({
      userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 } },
    })).toBeNull()
  })

  it('жёлтый userEnteredFormat → hex', () => {
    expect(getCellColor({
      userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 0 } },
    })).toBe('#ffff00')
  })

  it('цвет только в effectiveFormat → использует его', () => {
    expect(getCellColor({
      effectiveFormat: { backgroundColor: { red: 1, green: 0, blue: 0 } },
    })).toBe('#ff0000')
  })

  it('userEntered приоритетнее effective', () => {
    expect(getCellColor({
      userEnteredFormat: { backgroundColor: { red: 0, green: 1, blue: 0 } },
      effectiveFormat:  { backgroundColor: { red: 1, green: 0, blue: 0 } },
    })).toBe('#00ff00')
  })
})

// ─── isColored ────────────────────────────────────────────────────────────────

describe('isColored', () => {
  it('null → false', () => {
    expect(isColored(null)).toBe(false)
  })

  it('белый фон → false', () => {
    expect(isColored({
      userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 } },
    })).toBe(false)
  })

  it('цветной фон → true', () => {
    expect(isColored({
      userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 0 } },
    })).toBe(true)
  })
})

// ─── evalConditionalColor ─────────────────────────────────────────────────────

const yellowRule = (type: string, value?: string) => ({
  ranges: [{ startRowIndex: 0, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 3 }],
  booleanRule: {
    condition: { type, values: value != null ? [{ userEnteredValue: value }] : [] },
    format: { backgroundColor: { red: 1, green: 1, blue: 0 } },
  },
})

describe('evalConditionalColor', () => {
  it('пустой массив правил → {bg:null, fg:null}', () => {
    expect(evalConditionalColor('abc', 0, 0, [])).toEqual({ bg: null, fg: null })
  })

  it('TEXT_EQ: совпадение → возвращает цвет', () => {
    const result = evalConditionalColor('Сдан', 0, 0, [yellowRule('TEXT_EQ', 'Сдан')])
    expect(result.bg).toBe('#ffff00')
  })

  it('TEXT_EQ: не совпадение → {bg:null, fg:null}', () => {
    expect(evalConditionalColor('Другой', 0, 0, [yellowRule('TEXT_EQ', 'Сдан')])).toEqual({ bg: null, fg: null })
  })

  it('TEXT_EQ: пробелы trim-ятся', () => {
    const result = evalConditionalColor('  Сдан  ', 0, 0, [yellowRule('TEXT_EQ', 'Сдан')])
    expect(result.bg).toBe('#ffff00')
  })

  it('TEXT_CONTAINS: подстрока → совпадение', () => {
    const result = evalConditionalColor('Препродакшн Q1', 0, 0, [yellowRule('TEXT_CONTAINS', 'Препродакшн')])
    expect(result.bg).toBe('#ffff00')
  })

  it('NOT_BLANK: непустая строка → совпадение', () => {
    const result = evalConditionalColor('что-то', 0, 0, [yellowRule('NOT_BLANK')])
    expect(result.bg).toBe('#ffff00')
  })

  it('NOT_BLANK: пустая строка → нет совпадения', () => {
    expect(evalConditionalColor('', 0, 0, [yellowRule('NOT_BLANK')])).toEqual({ bg: null, fg: null })
  })

  it('BLANK: пустая строка → совпадение', () => {
    const result = evalConditionalColor('', 0, 0, [yellowRule('BLANK')])
    expect(result.bg).toBe('#ffff00')
  })

  it('ячейка вне диапазона правила → нет совпадения', () => {
    // Диапазон ограничен строками 0–5, проверяем строку 10
    expect(evalConditionalColor('Сдан', 10, 0, [yellowRule('TEXT_EQ', 'Сдан')])).toEqual({ bg: null, fg: null })
  })

  it('несколько правил — применяется первое совпавшее', () => {
    const rules = [
      yellowRule('TEXT_EQ', 'A'),
      {
        ranges: [{ startRowIndex: 0, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 3 }],
        booleanRule: {
          condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'A' }] },
          format: { backgroundColor: { red: 1, green: 0, blue: 0 } }, // красный
        },
      },
    ]
    // Первое правило — жёлтый, второе — красный. Победить должен жёлтый.
    expect(evalConditionalColor('A', 0, 0, rules).bg).toBe('#ffff00')
  })
})

// ─── cellStr ──────────────────────────────────────────────────────────────────

describe('cellStr', () => {
  it('null → пустая строка', () => {
    expect(cellStr(null)).toBe('')
  })

  it('undefined → пустая строка', () => {
    expect(cellStr(undefined)).toBe('')
  })

  it('пустой объект → пустая строка', () => {
    expect(cellStr({})).toBe('')
  })

  it('stringValue → возвращает строку с trim', () => {
    expect(cellStr({ userEnteredValue: { stringValue: '  Привет  ' } })).toBe('Привет')
  })

  it('numberValue → строковое представление', () => {
    expect(cellStr({ userEnteredValue: { numberValue: 42 } })).toBe('42')
  })

  it('boolValue → строка', () => {
    expect(cellStr({ userEnteredValue: { boolValue: true } })).toBe('true')
  })

  it('формульная ячейка (только effectiveValue) → effectiveValue', () => {
    expect(cellStr({
      userEnteredValue: { formulaValue: '=VLOOKUP(A1,B:C,2,0)' } as any,
      effectiveValue:   { stringValue: 'Результат' },
    })).toBe('Результат')
  })

  it('userEnteredValue приоритетнее effectiveValue', () => {
    expect(cellStr({
      userEnteredValue: { stringValue: 'явный' },
      effectiveValue:   { stringValue: 'вычисленный' },
    })).toBe('явный')
  })

  it('пустой userEnteredValue.stringValue → берём effectiveValue', () => {
    expect(cellStr({
      userEnteredValue: { stringValue: '' },
      effectiveValue:   { stringValue: 'эффективный' },
    })).toBe('эффективный')
  })
})

// ─── serialToDate ─────────────────────────────────────────────────────────────

describe('serialToDate', () => {
  it('serial 1 → 31 декабря 1899', () => {
    const d = serialToDate(1)
    expect(d.getFullYear()).toBe(1899)
    expect(d.getMonth()).toBe(11) // December (0-indexed)
    expect(d.getDate()).toBe(31)
  })

  it('serial 2 → 1 января 1900', () => {
    const d = serialToDate(2)
    expect(d.getFullYear()).toBe(1900)
    expect(d.getMonth()).toBe(0)
    expect(d.getDate()).toBe(1)
  })

  it('serial 45000 → год 2023', () => {
    expect(serialToDate(45000).getFullYear()).toBe(2023)
  })

  it('epoch правильный: serial 0 → 30 декабря 1899', () => {
    const d = serialToDate(0)
    expect(d.getFullYear()).toBe(1899)
    expect(d.getMonth()).toBe(11)
    expect(d.getDate()).toBe(30)
  })
})

// ─── parseSheetDate ───────────────────────────────────────────────────────────

describe('parseSheetDate', () => {
  it('пустая строка → null', () => {
    expect(parseSheetDate('')).toBeNull()
  })

  it('мусор → null', () => {
    expect(parseSheetDate('не дата')).toBeNull()
  })

  it('serial > 1000 → Date', () => {
    const d = parseSheetDate('45000')
    expect(d).toBeInstanceOf(Date)
    expect(d!.getFullYear()).toBe(2023)
  })

  it('serial ≤ 1000 → null', () => {
    expect(parseSheetDate('999')).toBeNull()
    expect(parseSheetDate('1000')).toBeNull()
    expect(parseSheetDate('1')).toBeNull()
  })

  it('формат DD.MM.YYYY → правильная дата', () => {
    const d = parseSheetDate('15.03.2024')
    expect(d).toBeInstanceOf(Date)
    expect(d!.getFullYear()).toBe(2024)
    expect(d!.getMonth()).toBe(2) // March
    expect(d!.getDate()).toBe(15)
  })

  it('формат D.M.YYYY (однозначные) → правильная дата', () => {
    const d = parseSheetDate('5.1.2023')
    expect(d).toBeInstanceOf(Date)
    expect(d!.getFullYear()).toBe(2023)
    expect(d!.getMonth()).toBe(0) // January
    expect(d!.getDate()).toBe(5)
  })

  it('ISO-строка → Date', () => {
    const d = parseSheetDate('2024-06-01')
    expect(d).toBeInstanceOf(Date)
    expect(d!.getFullYear()).toBe(2024)
  })
})

// ─── parseProjectStatus ───────────────────────────────────────────────────────

describe('parseProjectStatus', () => {
  const cases: [string, string][] = [
    ['Запрос',          'request'],
    ['На согласовании', 'negotiation'],
    ['Препродакшн',     'preproduction'],
    ['Продакшн',        'production'],
    ['Постпродакшн',    'postproduction'],
    ['Сдан',            'delivered'],
    ['Не согласован',   'rejected'],
    ['Отменён',         'cancelled'],
  ]

  it.each(cases)('"%s" → "%s"', (input, expected) => {
    expect(parseProjectStatus(input)).toBe(expected)
  })

  it('неизвестная строка → "request" (дефолт)', () => {
    expect(parseProjectStatus('Что-то другое')).toBe('request')
    expect(parseProjectStatus('')).toBe('request')
  })

  it('пробелы trim-ятся', () => {
    expect(parseProjectStatus('  Сдан  ')).toBe('delivered')
  })
})

// ─── parseEmploymentType ──────────────────────────────────────────────────────

describe('parseEmploymentType', () => {
  it('"ШТАТ" → "staff"', () => {
    expect(parseEmploymentType('ШТАТ')).toBe('staff')
  })

  it('"штат" (нижний регистр) → "staff"', () => {
    expect(parseEmploymentType('штат')).toBe('staff')
  })

  it('"ИП 7%" → "ip_7"', () => {
    expect(parseEmploymentType('ИП 7%')).toBe('ip_7')
  })

  it('"ИП 8%" → "ip_8"', () => {
    expect(parseEmploymentType('ИП 8%')).toBe('ip_8')
  })

  it('"ИП 10%" → "ip_10"', () => {
    expect(parseEmploymentType('ИП 10%')).toBe('ip_10')
  })

  it('"СЗТ" → "szt"', () => {
    expect(parseEmploymentType('СЗТ')).toBe('szt')
  })

  it('неизвестный тип → "staff" (дефолт)', () => {
    expect(parseEmploymentType('Неизвестно')).toBe('staff')
  })

  it('регистронезависимость', () => {
    expect(parseEmploymentType('ип 7%')).toBe('ip_7')
  })
})

// ─── isStaffType ──────────────────────────────────────────────────────────────

describe('isStaffType', () => {
  it('"ШТАТ" → true', () => {
    expect(isStaffType('ШТАТ')).toBe(true)
  })

  it('"штат" (нижний регистр) → true', () => {
    expect(isStaffType('штат')).toBe(true)
  })

  it('"ИП 7%" → false', () => {
    expect(isStaffType('ИП 7%')).toBe(false)
  })

  it('"СЗТ" → false', () => {
    expect(isStaffType('СЗТ')).toBe(false)
  })

  it('пустая строка → false', () => {
    expect(isStaffType('')).toBe(false)
  })
})
