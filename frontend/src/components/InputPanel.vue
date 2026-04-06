<script setup lang="ts">
import { computed } from "vue";

import type { InputType } from "../types";
import type { CostEstimateResponse, CostPricingSettings } from "../types";

const props = defineProps<{
  modelValue: string;
  inputType: InputType;
  loading: boolean;
  estimatingCost: boolean;
  generatingImages: boolean;
  costEstimate: CostEstimateResponse | null;
  costErrorMessage: string;
  costErrorSuggestion: string;
  pricing: CostPricingSettings;
  cacheEnabled: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "update:inputType": [value: InputType];
  "update:pricing": [value: CostPricingSettings];
  "update:cacheEnabled": [value: boolean];
  submit: [];
  cancel: [];
  estimate: [];
}>();

const hasInput = computed(() => props.modelValue.trim().length > 0);
const isProbablyUrl = computed(() => /^https?:\/\//i.test(props.modelValue.trim()));
const urlInvalidHint = computed(() => {
  if (props.inputType !== "url") return "";
  if (!hasInput.value) return "";
  if (isProbablyUrl.value) return "";
  return "URL 需以 http:// 或 https:// 开头。";
});

const textTooShortHint = computed(() => {
  if (props.inputType !== "text") return "";
  const length = props.modelValue.trim().length;
  if (!length) return "";
  if (length >= 20) return "";
  return "文本内容偏短，可能无法得到稳定结果（建议至少 20 个字符）。";
});

const canSubmit = computed(() => {
  if (!hasInput.value) return false;
  if (props.inputType === "url") return isProbablyUrl.value;
  return true;
});

function handleKeydown(event: KeyboardEvent) {
  if (props.inputType === "url" && event.key === "Enter" && !(event.metaKey || event.ctrlKey || event.shiftKey)) {
    event.preventDefault();
    if (canSubmit.value) emit("submit");
    return;
  }

  if (props.inputType === "text" && (event.metaKey || event.ctrlKey) && event.key === "Enter") {
    emit("submit");
  }
}

function patchPricing(patch: Partial<CostPricingSettings>) {
  emit("update:pricing", { ...props.pricing, ...patch });
}

function parseNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
</script>

<template>
  <section class="panel">
    <div class="panel-heading">
      <div>
        <h2>输入内容</h2>
        <p>支持公开网页链接，也支持直接粘贴文本。</p>
      </div>
      <div class="segmented-control">
        <button
          :class="['segment', { active: props.inputType === 'url' }]"
          type="button"
          @click="emit('update:inputType', 'url')"
        >
          URL
        </button>
        <button
          :class="['segment', { active: props.inputType === 'text' }]"
          type="button"
          @click="emit('update:inputType', 'text')"
        >
          文本
        </button>
      </div>
    </div>

    <input
      v-if="props.inputType === 'url'"
      :placeholder="'输入公开网页 URL（http/https）'"
      :value="props.modelValue"
      @keydown="handleKeydown"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />

    <label v-if="props.inputType === 'url'" class="switch-row">
      <input
        type="checkbox"
        :checked="props.cacheEnabled"
        @change="emit('update:cacheEnabled', ($event.target as HTMLInputElement).checked)"
      />
      <span>使用缓存（1 小时，仅缓存抓取/正文提取结果）</span>
    </label>

    <textarea
      v-else
      class="input-textarea"
      :placeholder="'粘贴需要改写的原文内容'"
      :value="props.modelValue"
      rows="7"
      @keydown="handleKeydown"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />

    <p v-if="urlInvalidHint" class="hint danger-text">{{ urlInvalidHint }}</p>
    <p v-else-if="textTooShortHint" class="hint">{{ textTooShortHint }}</p>

    <div class="actions-row">
      <button class="primary-button" type="button" :disabled="loading || !canSubmit" @click="emit('submit')">
        {{ loading ? "转换中..." : "开始转换" }}
      </button>
      <button
        class="secondary-button"
        type="button"
        :disabled="props.loading || props.estimatingCost || !canSubmit"
        @click="emit('estimate')"
      >
        {{ props.estimatingCost ? "估算中..." : "估算费用" }}
      </button>
      <button class="ghost-button" type="button" :disabled="!(loading || props.generatingImages)" @click="emit('cancel')">
        {{ props.generatingImages ? "取消生成" : "取消请求" }}
      </button>
      <p class="hint">快捷键：URL 模式回车提交；文本模式 `Ctrl/Cmd + Enter`。</p>
    </div>

    <details class="panel cost-panel">
      <summary class="summary">
        <span>费用单价（可选）</span>
        <span class="summary-value">{{ props.pricing.enabled ? "已启用" : "未启用" }}</span>
      </summary>
      <div class="stack">
        <label class="switch-row">
          <input
            type="checkbox"
            :checked="props.pricing.enabled"
            @change="patchPricing({ enabled: ($event.target as HTMLInputElement).checked })"
          />
          <span>启用 USD 换算（不影响实际请求，仅用于估算展示）</span>
        </label>

        <div class="grid-3">
          <label class="field">
            <span>Prompt $/1K tokens</span>
            <input
              type="number"
              min="0"
              step="0.0001"
              :value="props.pricing.prompt_usd_per_1k"
              @input="patchPricing({ prompt_usd_per_1k: parseNumber(($event.target as HTMLInputElement).value) })"
            />
          </label>
          <label class="field">
            <span>Completion $/1K tokens</span>
            <input
              type="number"
              min="0"
              step="0.0001"
              :value="props.pricing.completion_usd_per_1k"
              @input="patchPricing({ completion_usd_per_1k: parseNumber(($event.target as HTMLInputElement).value) })"
            />
          </label>
          <label class="field">
            <span>Image $/张</span>
            <input
              type="number"
              min="0"
              step="0.0001"
              :value="props.pricing.image_usd_each ?? ''"
              placeholder="可不填"
              @input="
                patchPricing({
                  image_usd_each:
                    ($event.target as HTMLInputElement).value === ''
                      ? null
                      : parseNumber(($event.target as HTMLInputElement).value),
                })
              "
            />
          </label>
        </div>

        <p
          class="hint"
          v-if="
            props.pricing.enabled &&
            (!(props.pricing.prompt_usd_per_1k > 0) || !(props.pricing.completion_usd_per_1k > 0))
          "
        >
          已启用换算，但单价需填写大于 0 才会返回 USD 估算结果。
        </p>
      </div>
    </details>

    <div v-if="props.costErrorMessage" class="error-card">
      <strong>{{ props.costErrorMessage }}</strong>
      <p>{{ props.costErrorSuggestion }}</p>
    </div>

    <div v-else-if="props.costEstimate" class="meta-card">
      <span>Prompt ~ {{ props.costEstimate.prompt_tokens }} tokens</span>
      <span>Completion 上限 ~ {{ props.costEstimate.completion_tokens_max }} tokens</span>
      <span>合计上限 ~ {{ props.costEstimate.total_tokens_max }} tokens</span>
      <span v-if="props.costEstimate.chunking.enabled">
        分块：{{ props.costEstimate.chunking.chunks }}（改写 {{ props.costEstimate.chunking.rewrite_calls }} + 合并 {{ props.costEstimate.chunking.merge_calls }}）
      </span>
      <span v-else>单次改写：1 次</span>
      <span v-if="props.costEstimate.images.enabled">图片：{{ props.costEstimate.images.calls }} 张</span>
      <span v-if="props.costEstimate.cost_usd">USD 上限 ~ ${{ props.costEstimate.cost_usd.total_max }}</span>
    </div>

    <div v-if="props.costEstimate?.notes?.length" class="hint">
      <p v-for="(note, index) in props.costEstimate.notes" :key="`${index}-${note.slice(0, 16)}`">{{ note }}</p>
    </div>
  </section>
</template>
