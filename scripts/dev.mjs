#!/usr/bin/env node
// Dev-лаунчер: поднимает API на СВОБОДНОМ порту (от 4000), чтобы не конфликтовать
// с параллельно запущенными приложениями (support и др.). Порт API прокидывается в Vite
// через VITE_DEV_API_PORT — Vite проксирует /api (+ WS) на него. Браузер ходит только
// на свой origin → CORS не нужен, авторизация не ломается. Web-порт Vite подбирает сам.
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'

function findFreePort(start, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      if (port > start + 200) return reject(new Error(`нет свободного порта от ${start}`))
      const srv = createServer()
      srv.once('error', (e) => {
        srv.close()
        if (e.code === 'EADDRINUSE') tryPort(port + 1)
        else reject(e)
      })
      srv.once('listening', () => srv.close(() => resolve(port)))
      srv.listen(port, host)
    }
    tryPort(start)
  })
}

const apiPort = await findFreePort(Number(process.env.PORT) || 4000)
console.log(`\n▶ Nexus dev — API :${apiPort} (web-порт Vite выберет сам, /api и WS проксируются на API)\n`)

const isWin = process.platform === 'win32'
const pnpm = isWin ? 'pnpm.cmd' : 'pnpm'
const opts = { stdio: 'inherit', shell: isWin }

const api = spawn(pnpm, ['--filter', '@nexus/api', 'dev'], {
  ...opts,
  env: { ...process.env, PORT: String(apiPort) },
})
const web = spawn(pnpm, ['--filter', '@nexus/web', 'dev'], {
  ...opts,
  env: { ...process.env, VITE_DEV_API_PORT: String(apiPort) },
})

let quitting = false
const shutdown = (code = 0) => {
  if (quitting) return
  quitting = true
  api.kill()
  web.kill()
  process.exit(code)
}
process.on('SIGINT', () => shutdown())
process.on('SIGTERM', () => shutdown())
api.on('exit', () => shutdown())
web.on('exit', () => shutdown())
