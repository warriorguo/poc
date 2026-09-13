import { defineConfig } from 'vitest/config'

// Its own config so the repo-root one (jsdom, React setup file) does not apply
// to this package, which is plain Node.
export default defineConfig({
  test: {
    environment: 'node',
    root: import.meta.dirname,
    testTimeout: 10_000,
  },
})
