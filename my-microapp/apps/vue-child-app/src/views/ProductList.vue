<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

interface Product {
  id: number
  name: string
  price: number
  description: string
}

const router = useRouter()

const products = ref<Product[]>([
  { id: 1, name: 'Product A', price: 99.99, description: 'High-quality product A' },
  { id: 2, name: 'Product B', price: 149.99, description: 'Premium product B' },
  { id: 3, name: 'Product C', price: 79.99, description: 'Economical product C' },
  { id: 4, name: 'Product D', price: 199.99, description: 'Luxury product D' },
  { id: 5, name: 'Product E', price: 59.99, description: 'Budget product E' },
])

const goToDetail = (id: number) => {
  router.push(`/product-detail/${id}`)
}
</script>

<template>
  <div class="product-list">
    <h2>Product List</h2>
    <div class="products">
      <div
        v-for="product in products"
        :key="product.id"
        class="product-card"
        @click="goToDetail(product.id)"
      >
        <h3>{{ product.name }}</h3>
        <p class="price">${{ product.price.toFixed(2) }}</p>
        <p class="description">{{ product.description }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.product-list {
  max-width: 1000px;
  margin: 0 auto;
}

h2 {
  color: #42b883;
  margin-bottom: 1.5rem;
}

.products {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1.5rem;
}

.product-card {
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1.5rem;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.product-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.product-card h3 {
  margin: 0 0 0.5rem 0;
  color: #333;
}

.price {
  color: #42b883;
  font-size: 1.25rem;
  font-weight: bold;
  margin: 0.5rem 0;
}

.description {
  color: #666;
  margin: 0;
}
</style>
