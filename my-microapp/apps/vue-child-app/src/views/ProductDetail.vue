<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

interface Product {
  id: number
  name: string
  price: number
  description: string
  details: string
}

const route = useRoute()
const router = useRouter()

const product = ref<Product | null>(null)

const productsData: Record<number, Product> = {
  1: {
    id: 1,
    name: 'Product A',
    price: 99.99,
    description: 'High-quality product A',
    details: 'This is a detailed description of Product A. It features premium materials and excellent craftsmanship.',
  },
  2: {
    id: 2,
    name: 'Product B',
    price: 149.99,
    description: 'Premium product B',
    details: 'Product B is our premium offering with advanced features and superior performance.',
  },
  3: {
    id: 3,
    name: 'Product C',
    price: 79.99,
    description: 'Economical product C',
    details: 'Product C offers great value for money with all essential features.',
  },
  4: {
    id: 4,
    name: 'Product D',
    price: 199.99,
    description: 'Luxury product D',
    details: 'Product D represents the pinnacle of luxury with exclusive materials.',
  },
  5: {
    id: 5,
    name: 'Product E',
    price: 59.99,
    description: 'Budget product E',
    details: 'Product E is perfect for budget-conscious customers without compromising quality.',
  },
}

onMounted(() => {
  const id = parseInt(route.params.id as string)
  product.value = productsData[id] || null
})

const goBack = () => {
  router.push('/product-list')
}
</script>

<template>
  <div class="product-detail">
    <button class="back-btn" @click="goBack">Back to Products</button>

    <div v-if="product" class="detail-content">
      <h2>{{ product.name }}</h2>
      <p class="price">${{ product.price.toFixed(2) }}</p>
      <p class="description">{{ product.description }}</p>
      <div class="details">
        <h3>Product Details</h3>
        <p>{{ product.details }}</p>
      </div>
    </div>

    <div v-else class="not-found">
      <h2>Product Not Found</h2>
      <p>The product you are looking for does not exist.</p>
    </div>
  </div>
</template>

<style scoped>
.product-detail {
  max-width: 800px;
  margin: 0 auto;
}

.back-btn {
  background: #42b883;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  margin-bottom: 1.5rem;
}

.back-btn:hover {
  background: #3a9d6f;
}

.detail-content {
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 2rem;
}

h2 {
  color: #333;
  margin: 0 0 0.5rem 0;
}

.price {
  color: #42b883;
  font-size: 1.5rem;
  font-weight: bold;
  margin: 0.5rem 0 1rem 0;
}

.description {
  color: #666;
  font-size: 1.1rem;
}

.details {
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid #eee;
}

.details h3 {
  color: #333;
}

.not-found {
  text-align: center;
  padding: 3rem;
  background: #f5f5f5;
  border-radius: 8px;
}

.not-found h2 {
  color: #d32f2f;
}
</style>
