<script setup lang="ts">
import { computed } from "vue";
export type StepperState = "idle" | "running" | "done" | "error";

const props = defineProps<{
  steps: string[];
  activeIndex: number;
  state: StepperState;
}>();

const progress = computed(() => {
  if (!props.steps.length) return 0;
  if (props.state === "done") return 100;
  const safeIndex = Math.max(0, Math.min(props.activeIndex, props.steps.length - 1));
  return Math.round(((safeIndex + 1) / props.steps.length) * 100);
});

const currentLabel = computed(() => {
  if (!props.steps.length) return "";
  const safeIndex = Math.max(0, Math.min(props.activeIndex, props.steps.length - 1));
  if (props.state === "done") return "已完成";
  if (props.state === "error") return props.steps[safeIndex] || "处理中";
  return props.steps[safeIndex] || "处理中";
});

function stepClass(index: number) {
  if (props.state === "error" && index === props.activeIndex) return "step error";
  if (index < props.activeIndex) return "step done";
  if (index === props.activeIndex && props.state !== "idle") return "step active";
  return "step";
}
</script>

<template>
  <div class="stepper-panel" role="status" aria-live="polite">
    <div class="stepper-head">
      <strong>{{ currentLabel }}</strong>
      <span>{{ progress }}%</span>
    </div>
    <div class="stepper-track">
      <div class="stepper-fill" :style="{ width: `${progress}%` }"></div>
    </div>
    <div class="stepper">
      <div v-for="(label, index) in props.steps" :key="`${index}-${label}`" :class="stepClass(index)">
        <span class="dot" />
        <span class="label">{{ label }}</span>
      </div>
    </div>
  </div>
</template>
