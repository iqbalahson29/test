import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // @quiz-platform/shared is a pnpm-linked workspace package that ships
  // CommonJS output (deliberately — apps/api needs CJS, see README). Vite
  // only does CJS->ESM interop for deps it pre-bundles; without forcing it
  // in here, a linked workspace package can get served raw via /@fs/ and
  // named imports (e.g. QuestionType) fail at runtime in the browser.
  optimizeDeps: {
    include: ['@quiz-platform/shared'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
