import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import qiankun from 'vite-plugin-qiankun';

export default defineConfig({
  plugins: [
    react(),
    qiankun('react-child-app', {
      useDevMode: true,
    }),
  ],
  server: {
    port: 3001,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
});
