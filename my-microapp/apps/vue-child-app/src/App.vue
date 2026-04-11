<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const navigateTo = (path: string) => {
  router.push(path)
}
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <h1>Vue Child App</h1>
      <nav class="app-nav">
        <button @click="navigateTo('/')">Home</button>
        <button @click="navigateTo('/product-list')">Products</button>
      </nav>
    </header>
    <main class="app-main">
      <router-view />
    </main>
    <footer class="app-footer">
      <p>Vue Child App - Port 3002</p>
    </footer>
  </div>
</template>

<style scoped>
.app-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: Arial, sans-serif;
}

.app-header {
  background-color: #42b883;
  color: white;
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.app-header h1 {
  margin: 0;
  font-size: 1.5rem;
}

.app-nav {
  display: flex;
  gap: 1rem;
}

.app-nav button {
  background: white;
  color: #42b883;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}

.app-nav button:hover {
  background: #f0f0f0;
}

.app-main {
  flex: 1;
  padding: 2rem;
}

.app-footer {
  background: #333;
  color: white;
  padding: 1rem 2rem;
  text-align: center;
}
</style>
