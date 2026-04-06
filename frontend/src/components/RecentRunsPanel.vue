<script setup lang="ts">
import type { RecentRunEntry } from "../types";

const props = defineProps<{
  entries: RecentRunEntry[];
}>();

const emit = defineEmits<{
  restore: [entry: RecentRunEntry];
  view: [entry: RecentRunEntry];
  remove: [id: string];
  "toggle-pin": [id: string];
  clear: [];
}>();

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
</script>

<template>
  <section class="drawer-section">
    <div class="drawer-header-row">
      <h2 class="drawer-title">历史结果</h2>
      <button v-if="props.entries.length" class="ghost-button danger" type="button" @click="emit('clear')">清空</button>
    </div>

    <div v-if="!props.entries.length" class="hint">完成几次改写或调研后，历史结果会保存在当前 profile 下，方便回看和继续写。</div>

    <div v-else class="recent-run-list">
      <article v-for="entry in props.entries" :key="entry.id" class="recent-run-card">
        <div class="recent-run-head">
          <div>
            <strong>{{ entry.title }}</strong>
            <p>
              {{ entry.mode === "discover" ? "调研" : "改写" }} · {{ entry.style_name || "未命名风格" }} ·
              {{ formatTime(entry.created_at) }}
            </p>
          </div>
          <div class="recent-run-head-meta">
            <span v-if="entry.pinned_for_style_memory" class="workflow-pill">已收藏为风格参考</span>
            <span class="workflow-pill">{{ entry.provider }} / {{ entry.model }}</span>
          </div>
        </div>

        <p class="recent-run-summary">{{ entry.summary }}</p>
        <div v-if="entry.brief_conclusion" class="recent-run-key-point">
          <strong>结论</strong>
          <span>{{ entry.brief_conclusion }}</span>
        </div>
        <div class="recent-run-metrics">
          <span>质量 {{ entry.quality_score }}/5</span>
          <span>已复用 {{ entry.restore_count }} 次</span>
          <span v-if="entry.source_count">来源 {{ entry.source_count }}</span>
          <span v-if="entry.result_too_long">长内容</span>
        </div>
        <div class="recent-run-preview">
          <div><strong>输入</strong> {{ entry.input_preview }}</div>
          <div><strong>结果</strong> {{ entry.result_excerpt }}</div>
        </div>

        <div class="actions-row">
          <button class="secondary-button" type="button" @click="emit('view', entry)">查看结果</button>
          <button class="ghost-button" type="button" @click="emit('toggle-pin', entry.id)">
            {{ entry.pinned_for_style_memory ? "取消风格收藏" : "收藏为风格参考" }}
          </button>
          <button class="secondary-button" type="button" @click="emit('restore', entry)">恢复到输入框</button>
          <button class="ghost-button danger" type="button" @click="emit('remove', entry.id)">删除</button>
        </div>
      </article>
    </div>
  </section>
</template>
