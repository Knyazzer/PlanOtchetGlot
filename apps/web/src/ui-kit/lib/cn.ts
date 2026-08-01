import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Слияние классов Tailwind с разрешением конфликтов (канон дом-кита). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
