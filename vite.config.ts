import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Path alias resolution
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  build: {
    // Build optimization options
    target: 'ES2022',
    minify: 'esbuild',
    sourcemap: false,
    reportCompressedSize: false,

    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'markdown': ['react-markdown', 'remark-gfm'],
          'syntax-highlighter': ['react-syntax-highlighter'],
        },
      },
    },

    // Chunk size warning limit (in KB)
    chunkSizeWarningLimit: 1000,
  },

  // Development server optimization
  server: {
    warmup: {
      clientFiles: ['./src/main.tsx', './src/App.tsx'],
    },
  },

  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-markdown'],
  },
})
