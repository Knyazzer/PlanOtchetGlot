/**
 * Applies migrations to TEST_DATABASE_URL.
 * Priority: process.env.TEST_DATABASE_URL (CI) → .env file (local dev).
 */
const { execSync } = require('child_process')
const { readFileSync, existsSync } = require('fs')
const { resolve } = require('path')

let testUrl = process.env.TEST_DATABASE_URL

if (!testUrl) {
  const envPath = resolve(__dirname, '../.env')
  if (!existsSync(envPath)) {
    console.error('TEST_DATABASE_URL not set and .env not found')
    process.exit(1)
  }
  const match = readFileSync(envPath, 'utf8').match(/^TEST_DATABASE_URL=(.+)$/m)
  if (!match) {
    console.error('TEST_DATABASE_URL not found in .env')
    process.exit(1)
  }
  testUrl = match[1].trim()
}

execSync(
  'npx prisma migrate deploy --schema packages/db/prisma/schema.prisma',
  { stdio: 'inherit', env: { ...process.env, DATABASE_URL: testUrl } },
)
