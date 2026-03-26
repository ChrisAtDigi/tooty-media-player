import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { devLibraryPlugin } from './scripts/dev-scanner.js'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
  },
  plugins: [
    react(),
    devLibraryPlugin(),
  ],
})
