// Database rule tests: need the local database (npm run db:start, then npm run db:reset).
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['tests/db/**/*.test.ts'], fileParallelism: false, testTimeout: 60_000, hookTimeout: 60_000 },
})
