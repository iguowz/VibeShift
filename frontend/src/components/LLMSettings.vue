<script setup lang="ts">
import { computed, ref } from "vue";

import { llmModelCatalog, providerPresets } from "../lib/presets";
import { testProviderConnection } from "../lib/api";
import type { ApiError, LLMConfig } from "../types";

const props = defineProps<{
  config: LLMConfig;
}>();

const emit = defineEmits<{
  update: [config: LLMConfig];
  preset: [key: keyof typeof providerPresets];
}>();

const testing = ref(false);
const testMessage = ref("");
const testError = ref("");

function patch<K extends keyof LLMConfig>(key: K, value: LLMConfig[K]) {
  emit("update", { ...props.config, [key]: value });
}

const groupedModels = computed(() => {
  return {
    text: llmModelCatalog.filter((item) => item.kind === "text"),
    multimodal: llmModelCatalog.filter((item) => item.kind === "multimodal"),
  };
});

function applyCatalogModel(entry: (typeof llmModelCatalog)[number]) {
  emit("update", {
    ...props.config,
    provider: entry.provider,
    base_url: entry.base_url,
    model: entry.model,
  });
}

async function handleTest() {
  testing.value = true;
  testMessage.value = "";
  testError.value = "";
  try {
    const response = await testProviderConnection({ llm: props.config });
    testMessage.value = response.message || "连接成功。";
  } catch (error) {
    const apiError = (error as { response?: { data?: ApiError } }).response?.data?.error;
    testError.value = [apiError?.message || "连接测试失败。", apiError?.suggestion].filter(Boolean).join(" ");
  } finally {
    testing.value = false;
  }
}
</script>

<template>
  <section class="drawer-section">
    <h2 class="drawer-title">模型设置</h2>

    <div class="preset-row">
      <button
        v-for="(preset, key) in providerPresets"
        :key="key"
        class="tag-button"
        type="button"
        @click="emit('preset', key)"
      >
        {{ preset.provider }}
      </button>
    </div>

    <details class="panel-lite" open>
      <summary class="sources-summary">常见文本 / 多模态模型</summary>
      <div class="model-catalog-section">
        <div class="model-catalog-block">
          <strong>文本与推理</strong>
          <div class="model-catalog-grid">
            <button
              v-for="entry in groupedModels.text"
              :key="entry.id"
              class="model-card"
              type="button"
              @click="applyCatalogModel(entry)"
            >
              <span>{{ entry.label }}</span>
              <small>{{ entry.model }}</small>
              <p>{{ entry.note }}</p>
            </button>
          </div>
        </div>

        <div class="model-catalog-block">
          <strong>多模态</strong>
          <div class="model-catalog-grid">
            <button
              v-for="entry in groupedModels.multimodal"
              :key="entry.id"
              class="model-card"
              type="button"
              @click="applyCatalogModel(entry)"
            >
              <span>{{ entry.label }}</span>
              <small>{{ entry.model }}</small>
              <p>{{ entry.note }}</p>
            </button>
          </div>
        </div>
      </div>
      <p class="hint" style="margin: 0.75rem 0 0">点一下即可把 provider / base URL / model 一并填入。</p>
    </details>

    <div class="stack compact">
      <label class="field">
        <span>用哪个服务</span>
        <input
          :value="props.config.provider"
          placeholder="例如：openai / ollama / deepseek"
          @input="patch('provider', ($event.target as HTMLInputElement).value)"
        />
      </label>

      <label class="field">
        <span>服务地址</span>
        <input
          :value="props.config.base_url"
          placeholder="例如：https://api.openai.com/v1 或 http://localhost:11434/v1"
          @input="patch('base_url', ($event.target as HTMLInputElement).value)"
        />
      </label>

      <label class="field">
        <span>密钥（没有就留空）</span>
        <input
          type="password"
          :value="props.config.api_key"
          @input="patch('api_key', ($event.target as HTMLInputElement).value)"
        />
      </label>

      <label class="field">
        <span>模型名</span>
        <input
          :value="props.config.model"
          placeholder="例如：gpt-4o-mini / qwen2.5:7b"
          @input="patch('model', ($event.target as HTMLInputElement).value)"
        />
      </label>

      <details class="panel-lite">
        <summary class="sources-summary">更多参数（可选）</summary>
        <div class="grid-3" style="margin-top: 0.75rem">
          <label class="field">
            <span>随机程度</span>
            <input
              type="number"
              min="0"
              max="2"
              step="0.1"
              :value="props.config.temperature"
              @input="patch('temperature', Number(($event.target as HTMLInputElement).value))"
            />
          </label>
          <label class="field">
            <span>最多输出</span>
            <input
              type="number"
              min="128"
              max="16000"
              step="1"
              :value="props.config.max_tokens"
              @input="patch('max_tokens', Number(($event.target as HTMLInputElement).value))"
            />
          </label>
          <label class="field">
            <span>稳定程度</span>
            <input
              type="number"
              min="0.1"
              max="1"
              step="0.1"
              :value="props.config.top_p"
              @input="patch('top_p', Number(($event.target as HTMLInputElement).value))"
            />
          </label>
        </div>
        <p class="hint" style="margin: 0.6rem 0 0">
          不确定就保持默认值即可。
        </p>
      </details>

      <div class="actions-row">
        <button class="secondary-button" type="button" :disabled="testing" @click="handleTest">
          {{ testing ? "测试中..." : "测试连接" }}
        </button>
        <span v-if="testMessage" class="success-text">{{ testMessage }}</span>
        <span v-else-if="testError" class="danger-text">{{ testError }}</span>
      </div>
    </div>
  </section>
</template>
