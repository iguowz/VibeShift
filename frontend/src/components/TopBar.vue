<script setup lang="ts">
defineProps<{
  title: string;
  tokenRateK: number | null;
  tokenGrade: 1 | 2 | 3 | 4 | 5 | null;
}>();

const emit = defineEmits<{
  openHistory: [];
  openSettings: [];
}>();
</script>

<template>
  <header class="topbar">
    <div class="topbar-title">{{ title }}</div>
    <div class="topbar-right">
      <div
        v-if="tokenRateK != null && tokenGrade != null"
        class="token-indicator"
        :aria-label="`生成速度 ${tokenRateK.toFixed(2)}K/s，等级 ${tokenGrade}G`"
        role="status"
      >
        <span class="token-grade">{{ tokenGrade }}G</span>
        <span class="token-rate">{{ tokenRateK.toFixed(2) }}K/s</span>
        <span class="token-bars" aria-hidden="true">
          <span :class="['bar', { active: tokenGrade >= 1 }]" />
          <span :class="['bar', { active: tokenGrade >= 2 }]" />
          <span :class="['bar', { active: tokenGrade >= 3 }]" />
          <span :class="['bar', { active: tokenGrade >= 4 }]" />
          <span :class="['bar', { active: tokenGrade >= 5 }]" />
        </span>
      </div>

      <button class="icon-button" type="button" aria-label="历史结果" @click="emit('openHistory')">历史</button>
      <button class="icon-button" type="button" aria-label="设置" @click="emit('openSettings')">设置</button>
    </div>
  </header>
</template>
