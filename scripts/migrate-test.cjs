#!/usr/bin/env node
// Applies Prisma migrations to the test database (TEST_DATABASE_URL).
// Usage: node scripts/migrate-test.cjs
'use strict';

const { execSync } = require('child_process');
const path = require('path');

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  // Try to load from .env
  require('fs')
    .readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
    .split('\n')
    .forEach((line) => {
      const m = line.match(/^TEST_DATABASE_URL=(.+)$/);
      if (m) process.env.TEST_DATABASE_URL = m[1].trim();
    });
}

if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL is not set');
  process.exit(1);
}

console.log('Applying migrations to test DB:', process.env.TEST_DATABASE_URL);

execSync('npx prisma migrate deploy --schema=prisma/schema.prisma', {
  cwd: path.join(__dirname, '..', 'packages', 'db'),
  env: {
    ...process.env,
    DATABASE_URL: process.env.TEST_DATABASE_URL,
  },
  stdio: 'inherit',
});

console.log('Test DB migrations applied successfully.');
