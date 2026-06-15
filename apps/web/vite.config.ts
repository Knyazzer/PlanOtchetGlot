import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Монорепо: .env лежит в корне, а не в apps/web — указываем Vite читать его оттуда
  envDir: '../../',
  server: {
    host: true,
  },
  optimizeDeps: {
    // Скан rolldown-vite не дискаверит recharts → его CJS-deps (lodash) уходят
    // в браузер сырыми require(). Форсируем пребандл явно.
    include: ['recharts'],
    exclude: [
      '@fullcalendar/react',
      '@fullcalendar/core',
      '@fullcalendar/daygrid',
      '@fullcalendar/timegrid',
      '@fullcalendar/interaction',
      // Пребандл rolldown ломает CJS-интероп es-toolkit внутри recharts 3
      // («require_isUnsafeProperty is not a function») — сервим как ESM-исходник
      'recharts',
    ],
  },
})
