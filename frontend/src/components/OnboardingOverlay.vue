<script setup lang="ts">
import { computed } from "vue";

type StepKey = 1 | 2 | 3;

const props = defineProps<{
  open: boolean;
  step: StepKey;
}>();

const emit = defineEmits<{
  close: [];
  next: [];
  openLLM: [];
  openStyles: [];
}>();

const title = computed(() => {
  if (props.step === 1) return "先设置模型";
  if (props.step === 2) return "再选择写作风格";
  return "输入并开始生成";
});
</script>

<template>
  <teleport to="body">
    <div v-if="props.open" class="onboarding-overlay" @click.self="emit('close')">
      <div class="onboarding-card">
        <div class="onboarding-top">
          <strong>新手引导（{{ props.step }}/3）</strong>
          <button class="icon-button" type="button" aria-label="关闭引导" @click="emit('close')">关闭</button>
        </div>

        <h3 class="onboarding-title">{{ title }}</h3>

        <div v-if="props.step === 1" class="onboarding-content">
          <p class="hint">打开设置，在“模型设置”里选择你用的服务，填好服务地址、模型名和密钥（没有就留空），然后点“测试连接”。</p>
          <button class="primary-button" type="button" @click="emit('openLLM')">打开模型设置</button>
        </div>

        <div v-else-if="props.step === 2" class="onboarding-content">
          <p class="hint">选择或编辑一个写作风格（你希望输出的口吻/结构）。也可以一键优化并对比效果。</p>
          <button class="primary-button" type="button" @click="emit('openStyles')">打开写作风格</button>
        </div>

        <div v-else class="onboarding-content">
          <p class="hint">输入 URL、正文或你想处理的问题，点击“开始”，观察进度并查看结果。</p>
          <button class="primary-button" type="button" @click="emit('close')">我知道了</button>
        </div>

        <div class="onboarding-actions">
          <button class="secondary-button" type="button" :disabled="props.step === 3" @click="emit('next')">
            {{ props.step === 3 ? "完成" : "下一步" }}
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>
