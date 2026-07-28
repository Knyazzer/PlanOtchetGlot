import { randomBytes } from 'node:crypto'

// Временный пароль: 10 читаемых символов (без двусмысленных 0/O/o/l/1/I).
// Админ передаёт его сотруднику лично (SMTP нет), сотрудник меняет при первом входе.
const PW_CHARS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function genTempPassword(): string {
  const b = randomBytes(10)
  let s = ''
  for (let i = 0; i < b.length; i++) s += PW_CHARS[b[i] % PW_CHARS.length]
  return s
}
