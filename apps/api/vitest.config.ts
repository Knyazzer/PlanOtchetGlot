import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'
import { resolve } from 'path'

// Загружаем .env из корня монорепо до старта воркеров
config({ path: resolve(__dirname, '../../.env') })

// Изолируем тесты от dev-БД: если задан TEST_DATABASE_URL — переключаемся на него.
// Воркеры наследуют process.env от этого процесса, поэтому Prisma-клиент
// внутри воркера видит уже переопределённый DATABASE_URL.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Один процесс — все integration-тесты ходят в одну БД
    fileParallelism: false,
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
  },
})
