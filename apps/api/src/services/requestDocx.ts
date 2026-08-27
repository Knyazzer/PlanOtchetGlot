import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx'

// Генерация заявления на отпуск (.docx). Шаблон-заготовка (РФ) — реквизиты организации уточним.
// Подстановка: ФИО, должность, период, количество дней, дата подачи.

const ORG = 'ООО «Мегаполис»' // TODO: вынести в конфиг организации

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
function ruDate(ymd: string): string {
  const d = new Date(ymd + 'T00:00:00')
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} г.`
}
function daysInclusive(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00'), b = new Date(to + 'T00:00:00')
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1)
}

export async function buildVacationDoc(opts: { name: string; position?: string | null; dateFrom: string; dateTo: string; submittedAt: string }): Promise<Buffer> {
  const { name, position, dateFrom, dateTo, submittedAt } = opts
  const days = daysInclusive(dateFrom, dateTo)
  const right = (text: string, bold = false) => new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text, bold, size: 24 })] })
  const body = (children: TextRun[], opts2: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; spacingBefore?: number } = {}) =>
    new Paragraph({ alignment: opts2.align ?? AlignmentType.JUSTIFIED, spacing: { before: opts2.spacingBefore ?? 0, line: 300 }, children })

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 1134, bottom: 1134, left: 1701, right: 850 } } },
      children: [
        right(`Генеральному директору`),
        right(ORG),
        right(`от ${position ? position + ' ' : ''}${name}`),
        new Paragraph({ spacing: { before: 400 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'ЗАЯВЛЕНИЕ', bold: true, size: 28 })] }),
        body([
          new TextRun({ text: `Прошу предоставить мне ежегодный оплачиваемый отпуск на ${days} календарных дней с ${ruDate(dateFrom)} по ${ruDate(dateTo)}.`, size: 24 }),
        ], { spacingBefore: 300 }),
        new Paragraph({
          spacing: { before: 700 },
          children: [
            new TextRun({ text: ruDate(submittedAt), size: 24 }),
            new TextRun({ text: '\t\t\t\t\t', size: 24 }),
            new TextRun({ text: '__________ / ' + name + ' /', size: 24 }),
          ],
        }),
      ],
    }],
  })

  return Packer.toBuffer(doc)
}
