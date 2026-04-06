<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { createStyleTemplate } from "../lib/styleSkill";
import type { StyleTemplate } from "../types";

const props = defineProps<{
  styles: StyleTemplate[];
  selectedId: string;
}>();

const emit = defineEmits<{
  select: [id: string];
  save: [style: StyleTemplate];
  remove: [id: string];
  importStyles: [styles: StyleTemplate[], mode: "merge" | "replace"];
}>();

const draftName = ref("");
const draftPrompt = ref("");
const search = ref("");
const importMessage = ref("");
const importMode = ref<"merge" | "replace">("merge");
const fileInputRef = ref<HTMLInputElement | null>(null);

const filteredStyles = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  if (!keyword) return props.styles;
  return props.styles.filter((style) =>
    [style.name, style.prompt, style.audience, style.tone, style.structure_template, ...(style.emphasis_points || [])]
      .join(" ")
      .toLowerCase()
      .includes(keyword),
  );
});

function loadStyle(style: StyleTemplate) {
  draftName.value = style.name;
  draftPrompt.value = style.prompt;
  emit("select", style.id);
}

function saveCurrent() {
  const id = props.selectedId || crypto.randomUUID();
  const current = props.styles.find((style) => style.id === props.selectedId);
  emit(
    "save",
    createStyleTemplate({
      ...(current || {}),
      id,
      name: draftName.value.trim(),
      prompt: draftPrompt.value.trim(),
    }),
  );
  emit("select", id);
}

function createNew() {
  emit("select", "");
  draftName.value = "";
  draftPrompt.value = "";
}

function downloadJson(filename: string, json: object) {
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportStyles() {
  importMessage.value = "";
  const payload = {
    exported_at: new Date().toISOString(),
    version: 1,
    styles: props.styles,
  };
  downloadJson(`vibeshift-styles-${new Date().toISOString().slice(0, 10)}.json`, payload);
  importMessage.value = "已导出风格 JSON。";
}

function requestImport(mode: "merge" | "replace") {
  importMessage.value = "";
  importMode.value = mode;
  fileInputRef.value?.click();
}

function normalizeImportedStyles(value: unknown): StyleTemplate[] {
  const stylesValue =
    value && typeof value === "object" && "styles" in (value as any) ? (value as any).styles : value;
  if (!Array.isArray(stylesValue)) {
    throw new Error("JSON 格式不正确：应为数组或包含 styles 数组的对象。");
  }

  const result: StyleTemplate[] = [];
  for (const item of stylesValue) {
    if (!item || typeof item !== "object") {
      throw new Error("JSON 格式不正确：styles 内存在非法项。");
    }
    const raw = item as Partial<StyleTemplate>;
    const name = String(raw.name || "").trim();
    const prompt = String(raw.prompt || "").trim();
    const id = String(raw.id || crypto.randomUUID()).trim();
    if (!name || !prompt) {
      throw new Error("JSON 格式不正确：每个风格需包含 name 与 prompt。");
    }
    result.push(createStyleTemplate({ ...(raw as Partial<StyleTemplate>), id, name, prompt }));
  }
  return result;
}

async function handleImportChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] || null;
  input.value = "";
  if (!file) return;

  try {
    const rawText = await file.text();
    const parsed = JSON.parse(rawText);
    const imported = normalizeImportedStyles(parsed);
    if (importMode.value === "replace") {
      const ok = window.confirm(`将覆盖当前风格库（${props.styles.length} 个）为导入的 ${imported.length} 个，是否继续？`);
      if (!ok) return;
    }
    emit("importStyles", imported, importMode.value);
    importMessage.value = `已导入 ${imported.length} 个风格（${importMode.value === "merge" ? "合并" : "覆盖"}）。`;
  } catch (error) {
    importMessage.value = (error as Error).message || "导入失败：无法解析 JSON。";
  }
}

watch(
  () => [props.selectedId, props.styles] as const,
  () => {
    const current = props.styles.find((style) => style.id === props.selectedId) || props.styles[0];
    if (!current || props.selectedId === "") {
      return;
    }
    draftName.value = current.name;
    draftPrompt.value = current.prompt;
  },
  { immediate: true, deep: true },
);
</script>

<template>
  <details class="panel">
    <summary class="summary">
      <span>风格指令库</span>
      <span class="summary-value">{{ props.styles.length }} 个模板</span>
    </summary>

    <div class="stack">
      <input v-if="props.styles.length > 2" v-model="search" placeholder="搜索风格模板" />

      <div class="tag-list">
        <button
          v-for="style in filteredStyles"
          :key="style.id"
          :class="['tag-chip', { active: style.id === props.selectedId }]"
          type="button"
          @click="loadStyle(style)"
        >
          {{ style.name }}
        </button>
      </div>

      <div class="actions-row">
        <button class="ghost-button" type="button" @click="exportStyles">导出 JSON</button>
        <button class="ghost-button" type="button" @click="requestImport('merge')">导入（合并）</button>
        <button class="ghost-button danger" type="button" @click="requestImport('replace')">导入（覆盖）</button>
        <p v-if="importMessage" class="hint">{{ importMessage }}</p>
      </div>

      <input
        ref="fileInputRef"
        type="file"
        accept="application/json"
        style="display: none"
        @change="handleImportChange"
      />

      <div class="grid-2">
        <label class="field">
          <span>风格名称</span>
          <input v-model="draftName" placeholder="例如：公众号解读" />
        </label>
        <div class="actions-row align-end">
          <button class="ghost-button" type="button" @click="createNew">新建模板</button>
          <button
            class="ghost-button danger"
            type="button"
            :disabled="!props.selectedId"
            @click="emit('remove', props.selectedId)"
          >
            删除当前
          </button>
        </div>
      </div>

      <label class="field">
        <span>风格指令</span>
        <textarea v-model="draftPrompt" rows="6" placeholder="输入完整的风格化改写要求" />
      </label>
      <p class="hint">支持变量：{title}、{summary}、{source_url}（在后端生成 Prompt 时自动替换）。</p>

      <button
        class="secondary-button"
        type="button"
        :disabled="!draftName.trim() || !draftPrompt.trim()"
        @click="saveCurrent"
      >
        保存风格模板
      </button>
    </div>
  </details>
</template>
