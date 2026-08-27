import { createRouter, createWebHistory } from 'vue-router'
import Ai from '../components/Ai.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Ai },
  ],
})

export default router
