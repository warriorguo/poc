import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    // Async queries default to a 1s deadline, which is tight enough to flake on
    // a loaded CI runner. The suite finishes in well under a second locally.
    testTimeout: 10_000,
  },
})
