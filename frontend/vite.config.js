import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    build: {
      manifest: true,
      rolldownOptions: {
        output: {
          codeSplitting: {
            includeDependenciesRecursively: false,
            groups: [
              { name: 'spark-viewer', test: /node_modules\/@sparkjsdev\/spark\//, priority: 30 },
              { name: 'three-engine', test: /node_modules\/three\//, priority: 20 },
            ],
          },
        },
      },
    },
    server: {
      // Dev-only: the enhancement manifest endpoint is served by the FastAPI backend.
      // Production relies on the deployed API origin instead.
      proxy: {
        '/api': env.MEMOVERSE_BACKEND_URL || 'http://127.0.0.1:8000',
      },
    },
  }
})
