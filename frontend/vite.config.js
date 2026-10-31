import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
  plugins: [react()],
  server: {
    // The enhancement manifest endpoint is served by the FastAPI backend.
    // Dev-only: production relies on the deployed API origin instead.
    proxy: {
      '/api': env.MEMOVERSE_BACKEND_URL || 'http://127.0.0.1:8000',
    },
  },
  }
})
