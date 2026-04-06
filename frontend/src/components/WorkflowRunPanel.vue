<script setup lang="ts">
import { computed, reactive, watch } from "vue";

import type { WorkflowArtifact, WorkflowRun } from "../types";

const props = defineProps<{
  run: WorkflowRun | null | undefined;
}>();

const expandedArtifacts = reactive<Record<string, boolean>>({});

const sortedArtifacts = computed(() => {
  return (props.run?.artifacts || []).slice().sort((a, b) => a.path.localeCompare(b.path));
});

watch(
  () => props.run?.id,
  () => {
    for (const key of Object.keys(expandedArtifacts)) {
      delete expandedArtifacts[key];
    }
  },
  { immediate: true },
);

function formatMs(value: number) {
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function artifactLanguage(artifact: WorkflowArtifact) {
  if (artifact.mime_type.includes("json")) return "json";
  if (artifact.mime_type.includes("markdown")) return "markdown";
  return "";
}

function setArtifactExpanded(id: string, open: boolean) {
  expandedArtifacts[id] = open;
}

function handleArtifactToggle(event: Event, id: string) {
  const target = event.target;
  if (!(target instanceof HTMLDetailsElement)) return;
  setArtifactExpanded(id, target.open);
}
</script>

<template>
  <section v-if="props.run" class="workflow-panel">
    <div class="workflow-summary">
      <div>
        <h3>任务轨迹</h3>
        <p>{{ props.run.summary || "本次运行已生成任务轨迹与中间产物。" }}</p>
      </div>
      <div class="workflow-meta">
        <span class="workflow-pill">{{ props.run.mode === "discover" ? "调研流" : "改写流" }}</span>
        <span class="workflow-pill">{{ props.run.status === "completed" ? "已完成" : props.run.status === "failed" ? "失败" : "运行中" }}</span>
        <span class="workflow-pill">{{ formatMs(props.run.duration_ms) }}</span>
      </div>
    </div>

    <div class="workflow-grid">
      <section class="workflow-card">
        <div class="workflow-card-head">
          <h4>阶段</h4>
          <span class="hint">{{ props.run.steps.length }} 步</span>
        </div>
        <ol class="workflow-steps">
          <li v-for="step in props.run.steps" :key="step.id" :class="['workflow-step', step.status]">
            <div class="workflow-step-top">
              <strong>{{ step.label }}</strong>
              <span>{{ formatMs(step.duration_ms) }}</span>
            </div>
            <p v-if="step.detail">{{ step.detail }}</p>
          </li>
        </ol>
      </section>

      <section class="workflow-card">
        <div class="workflow-card-head">
          <h4>产物</h4>
          <span class="hint">{{ sortedArtifacts.length }} 份</span>
        </div>
        <div class="artifact-list">
          <details
            v-for="artifact in sortedArtifacts"
            :key="artifact.id"
            class="artifact-item"
            @toggle="handleArtifactToggle($event, artifact.id)"
          >
            <summary class="artifact-summary">
              <div>
                <strong>{{ artifact.label }}</strong>
                <p>{{ artifact.kind }} · {{ formatBytes(artifact.size_bytes) }}</p>
              </div>
              <span class="hint">{{ artifact.path.split('/').pop() }}</span>
            </summary>
            <div v-if="expandedArtifacts[artifact.id]" class="artifact-body">
              <div class="artifact-path">{{ artifact.path }}</div>
              <pre :class="['artifact-preview', artifactLanguage(artifact)]"><code>{{ artifact.preview }}</code></pre>
            </div>
          </details>
        </div>
      </section>
    </div>
  </section>
</template>
