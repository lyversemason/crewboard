import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Served from https://lyversemason.github.io/soccer-sessions/ on GitHub Pages.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { include: ['tests/**/*.test.ts'] },
})
