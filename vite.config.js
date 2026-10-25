import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src',
  // root is src/, so read .env files from the project folder instead
  envDir: '..',
  build: {
    outDir: '../dist',
    rollupOptions: {
      input: {
        main: 'src/index.html'
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
})