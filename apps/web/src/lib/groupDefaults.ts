export const TV_FORMATS = ['Трансляция', 'Телерадио', 'Съемки']
export const FORMATS_WITH_LOCATION = ['Трансляция', 'Телерадио', 'Съемки']

export const DEFAULT_GROUP_TIMES: Record<string, { timeFrom: string; timeTo: string; startTime?: string }> = {
  sbor:      { timeFrom: '07:00', timeTo: '10:00' },
  zavoz:     { timeFrom: '10:00', timeTo: '11:00' },
  montazh:   { timeFrom: '11:00', timeTo: '16:00' },
  efir:      { timeFrom: '16:00', timeTo: '18:00', startTime: '16:30' },
  demontazh: { timeFrom: '18:00', timeTo: '20:00' },
  vyvoz:     { timeFrom: '20:00', timeTo: '21:00' },
}
