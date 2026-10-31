import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            {name:'spark-viewer',test:/node_modules\/@sparkjsdev\/spark\//,priority:30},
            {name:'three-engine',test:/node_modules\/three\//,priority:20},
          ],
        },
      },
    },
  },
  server: {
    proxy: { '/api': process.env.MEMOVERSE_BACKEND_URL || 'http://127.0.0.1:8000' },
  },
})
