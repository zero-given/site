import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import UnoCSS from '@unocss/vite';

export default defineConfig({
  plugins: [
    solid(),
    UnoCSS(),
  ],
  server: {
    port: 5173,
    strictPort: true,
    host: '0.0.0.0',
    cors: true,
    proxy: {
      '/api': {
        target: 'http://10.20.30.184:3002',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    target: 'esnext',
    modulePreload: {
      polyfill: false
    },
    sourcemap: true,
    minify: 'esbuild',
    cssMinify: true,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'solid': ['solid-js'],
          'solid-web': ['solid-js/web'],
          'virtual': ['virtual:uno.css'],
          'chart': ['chart.js', 'chartjs-adapter-date-fns'],
          'utils': ['date-fns', 'flexsearch', 'lz-string']
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  optimizeDeps: {
    include: [
      'solid-js',
      'solid-js/web',
      'chart.js',
      'date-fns',
      'flexsearch',
      'lz-string',
      'chartjs-adapter-date-fns'
    ],
    exclude: ['@unocss/reset'],
    force: false,
    esbuildOptions: {
      target: 'esnext',
      treeShaking: true,
      jsx: 'preserve',
      jsxImportSource: 'solid-js'
    }
  },
});
