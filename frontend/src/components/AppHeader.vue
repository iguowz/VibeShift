<script setup lang="ts">
defineProps<{
  theme: "light" | "dark";
}>();

const emit = defineEmits<{
  toggleTheme: [];
  clearLocalData: [];
}>();
</script>

<template>
  <header class="hero-card header">
    <div>
      <p class="eyebrow">Smart Content Remix</p>
      <h1>VibeShift</h1>
      <p class="subtitle">把网页或文案转换成你的表达方式，再决定是否配上插图。</p>
    </div>
    <div class="header-actions">
      <button class="ghost-button" type="button" @click="emit('clearLocalData')">清除本地数据</button>
      <button class="ghost-button" type="button" @click="emit('toggleTheme')">
        {{ theme === "light" ? "切到夜间" : "切到白天" }}
      </button>
    </div>
  </header>
</template>
