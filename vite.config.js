import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      compress: { passes: 2, drop_console: true, drop_debugger: true },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/motion/') || id.includes('node_modules/framer-motion/')) return 'motion';
          if (id.includes('node_modules/react-dom/')) return 'react';
          if (id.includes('node_modules/react/') || id.includes('node_modules/scheduler/')) return 'react';
        },
      },
    },
  },
});
