<script setup lang="ts">
import RecentRunsPanel from "./RecentRunsPanel.vue";
import type { RecentRunEntry } from "../types";

const props = defineProps<{
  open: boolean;
  entries: RecentRunEntry[];
}>();

const emit = defineEmits<{
  close: [];
  restore: [entry: RecentRunEntry];
  view: [entry: RecentRunEntry];
  remove: [id: string];
  "toggle-pin": [id: string];
  clear: [];
}>();
</script>

<template>
  <teleport to="body">
    <div v-if="props.open" class="drawer-overlay" @click.self="emit('close')">
      <aside class="drawer history-drawer">
        <div class="drawer-top">
          <div>
            <strong>历史结果</strong>
            <p class="hint">在这里回看、恢复或收藏之前的改写与调研。</p>
          </div>
          <button class="icon-button" type="button" aria-label="关闭历史结果" @click="emit('close')">关闭</button>
        </div>

        <div class="drawer-body">
          <RecentRunsPanel
            :entries="props.entries"
            @restore="emit('restore', $event)"
            @view="emit('view', $event)"
            @toggle-pin="emit('toggle-pin', $event)"
            @remove="emit('remove', $event)"
            @clear="emit('clear')"
          />
        </div>
      </aside>
    </div>
  </teleport>
</template>
