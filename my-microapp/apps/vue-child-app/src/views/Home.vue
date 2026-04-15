<script setup lang="ts">
import { useSharedStore } from '../composables/useSharedStore'

const { user, messages, setUser, addMessage, clearMessages } = useSharedStore()

const isQiankun = !!(window as any).__POWERED_BY_QIANKUN__ || !!(window as any).proxy
</script>

<template>
  <div class="home">
    <h2>Vue Child App - Home</h2>

    <!-- 父子通信：用户状态 -->
    <section class="card">
      <h3>Parent ↔ Child: User State</h3>
      <p><strong>Qiankun Mode:</strong> {{ isQiankun ? 'Yes' : 'No' }}</p>
      <div v-if="user">
        <p><strong>Current User:</strong> {{ user.name }} ({{ user.role }})</p>
        <button @click="setUser(null)">Logout (Vue Child)</button>
      </div>
      <div v-else>
        <p>No user logged in.</p>
        <button @click="setUser({ id: '3', name: 'VueUser', role: 'user' })">
          Login as VueUser (from Vue Child)
        </button>
      </div>
    </section>

    <!-- 兄弟通信：消息 -->
    <section class="card">
      <h3>Sibling Communication: Messages</h3>
      <div class="btn-group">
        <button class="vue-btn" @click="addMessage('vue-child-app', 'Hello from Vue Child!')">
          Send Message
        </button>
        <button @click="clearMessages">Clear All</button>
      </div>
      <p v-if="!messages?.length" class="empty">No messages yet.</p>
      <ul v-else class="msg-list">
        <li
          v-for="msg in messages"
          :key="msg.id"
          :class="['msg-item', `msg-${msg.from}`]"
        >
          <strong>[{{ msg.from }}]</strong> {{ msg.content }}
          <span class="time">{{ new Date(msg.timestamp).toLocaleTimeString() }}</span>
        </li>
      </ul>
    </section>
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

.card {
  margin-top: 20px;
  padding: 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
}

.card h3 {
  margin-top: 0;
}

.btn-group {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.vue-btn {
  background: #42b883;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
}

button {
  padding: 8px 16px;
  cursor: pointer;
  border-radius: 4px;
}

.empty {
  color: #999;
}

.msg-list {
  list-style: none;
  padding: 0;
}

.msg-item {
  padding: 8px 12px;
  margin-bottom: 6px;
  border-radius: 4px;
}

.msg-main-app {
  background: #e3f2fd;
  border-left: 3px solid #1976d2;
}

.msg-react-child-app {
  background: #e8f5e9;
  border-left: 3px solid #388e3c;
}

.msg-vue-child-app {
  background: #fff3e0;
  border-left: 3px solid #f57c00;
}

.time {
  float: right;
  color: #999;
  font-size: 12px;
}
</style>
