import { setupServer } from 'msw/node'

// Shared MSW server instance — handlers are added per test via server.use(...)
export const server = setupServer()
