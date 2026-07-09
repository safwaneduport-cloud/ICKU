import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // In an npm-workspaces monorepo, React lives in ../node_modules. Force every
  // import of react/react-dom to resolve to that single copy (avoids the
  // "Invalid hook call / more than one copy of React" error).
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query', 'axios', 'recharts'],
  },
  server: {
    port: 5173,
    // In dev, forward /api calls to the Express server so there's no CORS friction.
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
