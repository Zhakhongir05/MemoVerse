import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The enhancement manifest endpoint is served by the FastAPI backend.
    // Dev-only: production relies on the deployed API origin instead.
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
