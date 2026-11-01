import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Served from https://lyversemason.github.io/soccer-sessions/ on GitHub Pages.
export default defineConfig({
  base: './',
  plugins: [react()],
  // tests/db needs the local database running; it has its own command (npm run test:db).
  test: { include: ['tests/**/*.test.ts'], exclude: ['tests/db/**', 'node_modules/**'] },
})
