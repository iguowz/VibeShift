<script setup lang="ts">
import { computed } from "vue";

import { imageProviderPresets, imageStylePresets, mediaModelCatalog } from "../lib/presets";
import type { ImageConfig } from "../types";

const props = defineProps<{
  config: ImageConfig;
}>();

const emit = defineEmits<{
  update: [config: ImageConfig];
  reset: [];
}>();

function patch<K extends keyof ImageConfig>(key: K, value: ImageConfig[K]) {
  emit("update", { ...props.config, [key]: value });
}

const imageModels = computed(() => mediaModelCatalog.filter((item) => item.kind === "image"));
const videoModels = computed(() => mediaModelCatalog.filter((item) => item.kind === "video"));

function applyImageModel(entry: (typeof mediaModelCatalog)[number]) {
  emit("update", {
    ...props.config,
    enabled: true,
    provider: entry.provider,
    base_url: entry.base_url,
    model: entry.model,
  });
}

function applyImageProvider(key: keyof typeof imageProviderPresets) {
  emit("update", {
    ...props.config,
    enabled: true,
    ...imageProviderPresets[key],
  });
}
</script>

<template>
  <details class="panel">
    <summary class="summary">
      <span>插图生成</span>
      <span class="summary-value">
        {{
          props.config.enabled
            ? props.config.smart_mode
              ? `智能（最多 ${props.config.smart_max_count} 张）`
              : `${props.config.count} 张`
            : "已关闭"
        }}
      </span>
    </summary>

    <div class="stack">
      <div class="actions-row align-end">
        <button class="ghost-button" type="button" @click="emit('reset')">恢复默认</button>
      </div>

      <label class="switch-row">
        <input
          type="checkbox"
          :checked="props.config.enabled"
          @change="patch('enabled', ($event.target as HTMLInputElement).checked)"
        />
        <span>开启插图生成</span>
      </label>

      <template v-if="props.config.enabled">
        <details class="panel-lite" open>
          <summary class="sources-summary">常见图片 / 视频模型参考</summary>
          <div class="model-catalog-section">
            <div class="model-catalog-block">
              <strong>图片生成</strong>
              <div class="preset-row">
                <button
                  v-for="(preset, key) in imageProviderPresets"
                  :key="key"
                  class="tag-button"
                  type="button"
                  @click="applyImageProvider(key)"
                >
                  {{ preset.provider }}
                </button>
              </div>
              <div class="model-catalog-grid">
                <button
                  v-for="entry in imageModels"
                  :key="entry.id"
                  class="model-card"
                  type="button"
                  @click="applyImageModel(entry)"
                >
                  <span>{{ entry.label }}</span>
                  <small>{{ entry.model }}</small>
                  <p>{{ entry.note }}</p>
                </button>
              </div>
            </div>

            <div class="model-catalog-block">
              <strong>视频模型参考</strong>
              <div class="model-catalog-grid">
                <article v-for="entry in videoModels" :key="entry.id" class="model-card passive">
                  <span>{{ entry.label }}</span>
                  <small>{{ entry.model }}</small>
                  <p>{{ entry.note }}</p>
                </article>
              </div>
              <p class="hint">当前主流程可直接接入图片模型；视频模型先作为常见配置参考展示。</p>
            </div>
          </div>
        </details>

        <div class="grid-3">
          <label class="field">
            <span>图片服务地址</span>
            <input
              :value="props.config.base_url || ''"
              placeholder="不填则默认跟随上面的模型设置"
              @input="patch('base_url', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="field">
            <span>图片模型名</span>
            <input
              :value="props.config.model || ''"
              placeholder="例如：gpt-image-1"
              @input="patch('model', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="field">
            <span>{{ props.config.smart_mode ? "最多张数" : "数量" }}</span>
            <select
              :value="props.config.smart_mode ? props.config.smart_max_count : props.config.count"
              @change="
                props.config.smart_mode
                  ? patch('smart_max_count', Number(($event.target as HTMLSelectElement).value))
                  : patch('count', Number(($event.target as HTMLSelectElement).value))
              "
            >
              <option :value="1">1</option>
              <option :value="2">2</option>
              <option :value="3">3</option>
            </select>
          </label>
        </div>

        <label class="switch-row">
          <input
            type="checkbox"
            :checked="props.config.smart_mode"
            @change="patch('smart_mode', ($event.target as HTMLInputElement).checked)"
          />
          <span>智能生成（自动选择风格与张数）</span>
        </label>

        <label class="field">
          <span>插图位置</span>
          <select
            :value="props.config.placement"
            @change="patch('placement', ($event.target as HTMLSelectElement).value as ImageConfig['placement'])"
          >
            <option value="header">文章开头</option>
            <option value="interleave">穿插文中</option>
            <option value="footer">文章末尾</option>
          </select>
        </label>

        <template v-if="!props.config.smart_mode">
          <div class="tag-list">
            <button
              v-for="preset in imageStylePresets"
              :key="preset"
              :class="['tag-chip', { active: props.config.style_preset === preset }]"
              type="button"
              @click="patch('style_preset', preset)"
            >
              {{ preset }}
            </button>
          </div>

          <label class="field">
            <span>自定义视觉提示词</span>
            <textarea
              rows="4"
              :value="props.config.custom_prompt"
              @input="patch('custom_prompt', ($event.target as HTMLTextAreaElement).value)"
            />
          </label>
        </template>

        <label class="field">
          <span>图片服务密钥（没有就留空）</span>
          <input
            type="password"
            :value="props.config.api_key || ''"
            @input="patch('api_key', ($event.target as HTMLInputElement).value)"
          />
        </label>

        <label class="switch-row">
          <input
            type="checkbox"
            :checked="props.config.retry_on_failure"
            @change="patch('retry_on_failure', ($event.target as HTMLInputElement).checked)"
          />
          <span>图片生成失败时自动重试一次</span>
        </label>

        <template v-if="props.config.retry_on_failure">
          <label class="field">
            <span>重试策略</span>
            <select
              :value="props.config.retry_strategy"
              @change="patch('retry_strategy', ($event.target as HTMLSelectElement).value as ImageConfig['retry_strategy'])"
            >
              <option value="simplify_prompt">简化提示词</option>
              <option value="fallback_model">换一个模型再试</option>
            </select>
          </label>

          <label v-if="props.config.retry_strategy === 'fallback_model'" class="field">
            <span>备用模型名</span>
            <input
              :value="props.config.fallback_model || ''"
              placeholder="例如：gpt-image-1 / sd3 / flux.1"
              @input="patch('fallback_model', ($event.target as HTMLInputElement).value)"
            />
          </label>

          <p
            v-if="props.config.retry_strategy === 'fallback_model' && !(props.config.fallback_model || '').trim()"
            class="hint danger-text"
          >
            选择“换一个模型再试”时，请填写备用模型名，否则重试会直接失败。
          </p>
        </template>
      </template>
    </div>
  </details>
</template>
