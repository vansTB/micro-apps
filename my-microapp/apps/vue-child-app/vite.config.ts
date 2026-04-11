import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import qiankun from 'vite-plugin-qiankun'

export default defineConfig({
  plugins: [
    vue(),
    qiankun('vue-child-app', {
      useDevMode: true,
    }),
  ],
  server: {
    port: 3002,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
})
