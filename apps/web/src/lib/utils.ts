import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// "Фамилия Имя Отчество" → "Имя Фамилия"
export function formatName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length >= 2) return `${parts[1]} ${parts[0]}`
  return fullName
}
