import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    testTimeout: 10000, // 10 second timeout per test
    hookTimeout: 5000   // 5 second timeout for setup/teardown
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm']
  }
})