<script setup lang="ts">
import { providerPresets } from "../lib/presets";
import type { LLMConfig } from "../types";

const props = defineProps<{
  config: LLMConfig;
  testing: boolean;
  providerTestMessage: string;
}>();

const emit = defineEmits<{
  update: [config: LLMConfig];
  preset: [key: keyof typeof providerPresets];
  test: [];
  reset: [];
}>();

function patch<K extends keyof LLMConfig>(key: K, value: LLMConfig[K]) {
  emit("update", { ...props.config, [key]: value });
}
</script>

<template>
  <details class="panel">
    <summary class="summary">
      <span>LLM 配置</span>
      <span class="summary-value">{{ props.config.provider }} / {{ props.config.model }}</span>
    </summary>

    <div class="stack">
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

      <label class="field">
        <span>Provider</span>
        <input :value="props.config.provider" @input="patch('provider', ($event.target as HTMLInputElement).value)" />
      </label>

      <label class="field">
        <span>Base URL</span>
        <input :value="props.config.base_url" @input="patch('base_url', ($event.target as HTMLInputElement).value)" />
      </label>

      <label class="field">
        <span>API Key</span>
        <input type="password" :value="props.config.api_key" @input="patch('api_key', ($event.target as HTMLInputElement).value)" />
      </label>

      <label class="field">
        <span>模型名称</span>
        <input :value="props.config.model" @input="patch('model', ($event.target as HTMLInputElement).value)" />
      </label>

      <div class="grid-3">
        <label class="field">
          <span>Temperature</span>
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
          <span>Max Tokens</span>
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
          <span>Top P</span>
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

      <div class="actions-row">
        <button class="secondary-button" type="button" :disabled="props.testing" @click="emit('test')">
          {{ props.testing ? "测试中..." : "测试连接" }}
        </button>
        <button class="ghost-button" type="button" @click="emit('reset')">恢复默认</button>
        <p v-if="props.providerTestMessage" class="success-text">{{ props.providerTestMessage }}</p>
      </div>
    </div>
  </details>
</template>
