<template>
  <div>
    <button @click="toggleDark">{{ isDark ? '☀️' :'🌙 '}}</button>
    <router-view />
  </div>
</template>
<script setup lang="ts">
import {ref} from 'vue'
const isDark=ref(false)
function toggleDark(){
  isDark.value=!isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)  
}
</script>

