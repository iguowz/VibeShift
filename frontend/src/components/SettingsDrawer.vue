<script setup lang="ts">
import { computed } from "vue";

import LLMSettings from "./LLMSettings.vue";
import StyleSettings from "./StyleSettings.vue";
import ImageConfigPanel from "./ImageConfigPanel.vue";
import { usePreferencesStore } from "../stores/preferences";
import { useRunMemoryStore } from "../stores/runMemory";

type TabKey = "llm" | "styles" | "advanced";

const props = defineProps<{
  open: boolean;
  currentInput: string;
  tab: TabKey;
}>();

const emit = defineEmits<{
  close: [];
  "update:tab": [tab: TabKey];
}>();

const store = usePreferencesStore();
const runMemory = useRunMemoryStore();

const tabs = computed(() => [
  { key: "llm" as const, label: "模型设置" },
  { key: "styles" as const, label: "写作风格" },
  { key: "advanced" as const, label: "高级" },
]);

function handleClearLocalData() {
  const ok = window.confirm("将清除主题偏好、风格库和近期任务记忆等本地数据（仅影响当前浏览器）。是否继续？");
  if (!ok) return;
  store.clearLocalData();
  store.resetLLMConfig();
  store.resetImageConfig();
  runMemory.clearRecentRuns();
}
</script>

<template>
  <teleport to="body">
    <div v-if="props.open" class="drawer-overlay" @click.self="emit('close')">
      <aside class="drawer">
        <div class="drawer-top">
          <div class="drawer-tabs">
            <button
              v-for="item in tabs"
              :key="item.key"
              :class="['drawer-tab', { active: item.key === props.tab }]"
              type="button"
              @click="emit('update:tab', item.key)"
            >
              {{ item.label }}
            </button>
          </div>
          <button class="icon-button" type="button" aria-label="关闭" @click="emit('close')">关闭</button>
        </div>

        <div class="drawer-body">
          <LLMSettings
            v-if="props.tab === 'llm'"
            :config="store.llmConfig"
            @update="store.llmConfig = $event"
            @preset="store.applyProviderPreset"
          />

          <StyleSettings v-else-if="props.tab === 'styles'" :current-input="props.currentInput" />

          <section v-else class="drawer-section">
            <h2 class="drawer-title">高级设置</h2>

            <div class="actions-row">
              <button class="ghost-button" type="button" @click="store.toggleTheme">
                {{ store.theme === "light" ? "切到夜间" : "切到白天" }}
              </button>
              <button class="ghost-button danger" type="button" @click="handleClearLocalData">
                清除本地数据
              </button>
            </div>

            <label class="checkbox-row">
              <input v-model="store.autoStyleEnabled" type="checkbox" />
              <span>
                <strong>自动匹配风格</strong>
                <span class="hint">根据当前内容、近期高质量结果和已接受的风格记忆自动推荐；你仍然可以手动切换。</span>
              </span>
            </label>

            <ImageConfigPanel :config="store.imageConfig" @update="store.imageConfig = $event" @reset="store.resetImageConfig" />
            <p class="hint">
              提示：配置会保存在当前浏览器本地（仅你自己可见）。如在公用电脑上使用，请记得清除本地数据。
            </p>
          </section>
        </div>
      </aside>
    </div>
  </teleport>
</template>
