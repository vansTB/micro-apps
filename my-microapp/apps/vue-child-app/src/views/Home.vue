<script setup lang="ts">
import { ref } from 'vue'

const message = ref('Welcome to Vue Child App')
</script>

<template>
  <div class="home">
    <h2>{{ message }}</h2>
    <p>This is the home page of the Vue child application.</p>
    <div class="info-card">
      <h3>About This App</h3>
      <ul>
        <li>Framework: Vue 3 + TypeScript</li>
        <li>Build Tool: Vite</li>
        <li>Micro-frontend: Qiankun</li>
        <li>Router: Vue Router</li>
        <li>Port: 3002</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.home {
  max-width: 800px;
  margin: 0 auto;
}

h2 {
  color: #42b883;
}

.info-card {
  background: #f5f5f5;
  padding: 1.5rem;
  border-radius: 8px;
  margin-top: 1.5rem;
}

.info-card h3 {
  margin-top: 0;
  color: #333;
}

.info-card ul {
  margin: 0;
  padding-left: 1.5rem;
}

.info-card li {
  margin: 0.5rem 0;
}
</style>
