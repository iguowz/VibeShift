<script setup lang="ts">
import type { RecentRunEntry } from "../types";

const props = defineProps<{
  entries: RecentRunEntry[];
}>();

const emit = defineEmits<{
  view: [entry: RecentRunEntry];
  restore: [entry: RecentRunEntry];
}>();
</script>

<template>
  <section v-if="props.entries.length" class="pinned-runs">
    <div class="drawer-header-row">
      <h2 class="drawer-title">收藏结果</h2>
      <span class="hint">会优先展示你反复使用的高质量历史结果</span>
    </div>

    <div class="pinned-runs-grid">
      <article v-for="entry in props.entries" :key="entry.id" class="pinned-run-card">
        <div class="recent-run-head">
          <div>
            <strong>{{ entry.title }}</strong>
            <p>{{ entry.mode === "discover" ? "调研" : "改写" }} · {{ entry.style_name || "未命名风格" }}</p>
          </div>
          <span class="workflow-pill">质量 {{ entry.quality_score }}/5</span>
        </div>

        <p class="recent-run-summary">{{ entry.brief_conclusion || entry.summary }}</p>
        <div v-if="entry.brief_key_findings?.length" class="pinned-run-points">
          <span v-for="item in entry.brief_key_findings.slice(0, 2)" :key="item" class="workflow-pill">{{ item }}</span>
        </div>

        <div class="actions-row">
          <button class="secondary-button" type="button" @click="emit('view', entry)">查看结果</button>
          <button class="ghost-button" type="button" @click="emit('restore', entry)">恢复到输入框</button>
        </div>
      </article>
    </div>
  </section>
</template>
