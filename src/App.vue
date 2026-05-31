<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Layout from "./components/Layout.vue"

const route = useRoute()
const isFullPage = computed(() => route.path === '/login' || route.path === '/login/callback' || route.path === '/settings' || route.path === '/agent-settings')
</script>

<template>
  <Layout v-if="!isFullPage" />
  <router-view v-else />
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background: #FAFAFA;
  color: #1A1A1A;
}
</style>
