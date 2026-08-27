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
    // Единый инстанс React для исходников И пре-бандленных зависимостей (lucide-react,
    // recharts). Без дедупа Vite может дать зависимости отдельную копию React → в браузере
    // «Invalid hook call / useContext of null». Копия react в node_modules одна — форсируем.
    dedupe: ['react', 'react-dom'],
  },
  // Монорепо: .env лежит в корне, а не в apps/web — указываем Vite читать его оттуда
  envDir: '../../',
  server: {
    host: true,
    // Dev-прокси: /api (+ WS) → на порт API, который лаунчер (scripts/dev.mjs) нашёл свободным
    // и прокинул через VITE_DEV_API_PORT. Браузер ходит на свой origin → CORS не нужен,
    // авторизация работает при любом наборе занятых портов. Прод не затрагивается.
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.VITE_DEV_API_PORT ?? '4000'}`,
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
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
