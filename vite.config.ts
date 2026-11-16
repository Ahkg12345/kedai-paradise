import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  server: {
    port: 3000,
    strictPort: true,
    allowedHosts: [
      'kedai-paradise-setup-phase-1.v0.build',
      'sb-3vcygp6zyfw5.vercel.run',
      'sb-1dwvg4jcvpab.vercel.run',
      '.vercel.run',
    ],
  },
  preview: {
    allowedHosts: ['sb-1dwvg4jcvpab.vercel.run', '.vercel.run'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
