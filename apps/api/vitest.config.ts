import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'
import { resolve } from 'path'

// Загружаем .env из корня монорепо до старта воркеров
config({ path: resolve(__dirname, '../../.env') })

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Один процесс — все integration-тесты ходят в одну БД
    singleThread: true,
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
  },
})
