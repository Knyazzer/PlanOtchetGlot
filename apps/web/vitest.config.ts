import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Monorepo root node_modules — used by @testing-library/react and react-dom
// Force Vite to resolve react/react-dom to the same instance so hooks work in tests
const rootModules = path.resolve(__dirname, '../../node_modules')

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      react: path.join(rootModules, 'react'),
      'react-dom': path.join(rootModules, 'react-dom'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // supabase.ts создаёт клиент на этапе импорта и падает без URL.
    // В тестах Supabase замокан — даём детерминированные заглушки.
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
})
