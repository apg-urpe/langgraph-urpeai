<script setup>
import DefaultTheme from 'vitepress/theme'
import { computed, onMounted } from 'vue'
import { useData } from 'vitepress'
import TeamHome from './TeamHome.vue'
import TeamNav from './TeamNav.vue'

const DefaultLayout = DefaultTheme.Layout
const { frontmatter } = useData()
const isHomePage = computed(() => frontmatter.value.layout === 'home')

onMounted(() => {
  document.documentElement.setAttribute('data-docs-mode', 'team')
  document.documentElement.classList.add('dark')
})
</script>

<template>
  <DefaultLayout>
    <template #sidebar-nav-before>
      <TeamNav />
    </template>

    <template #home-hero-before>
      <TeamHome v-if="isHomePage" />
    </template>
  </DefaultLayout>
</template>
