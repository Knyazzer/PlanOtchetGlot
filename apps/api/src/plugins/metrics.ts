import { FastifyInstance } from 'fastify'
import { register, collectDefaultMetrics, Histogram, Counter } from 'prom-client'

collectDefaultMetrics({ prefix: 'tvshifts_' })

const httpDuration = new Histogram({
  name: 'tvshifts_http_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
})

const httpTotal = new Counter({
  name: 'tvshifts_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
})

export async function metricsPlugin(app: FastifyInstance) {
  app.addHook('onResponse', (request, reply, done) => {
    const route = request.routerPath || request.url
    const labels = { method: request.method, route, status: String(reply.statusCode) }
    httpDuration.observe(labels, reply.elapsedTime / 1000)
    httpTotal.inc(labels)
    done()
  })

  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', register.contentType)
    return register.metrics()
  })
}
