import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // In production nginx serves the bundle and the API from one origin. The
    // dev server proxies /api so the client's same-origin cookie works here too.
    // Matches the API's default PORT.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: false,
      },
    },
  },
})
