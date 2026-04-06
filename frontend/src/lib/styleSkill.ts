import type { FunctionSkill, StyleSkillProfile, StyleTemplate } from "../types";

export function createStyleSkillDefaults(name = ""): Omit<StyleTemplate, "id" | "name" | "prompt"> {
  return {
    audience: "",
    tone: "",
    structure_template: "",
    emphasis_points: [],
    citation_policy: "auto",
    title_policy: "retain",
    image_focus: "auto",
    layout_format: "auto",
    visual_mode: "auto",
  };
}

export function buildStyleProfile(
  style: StyleTemplate | null | undefined,
  options: {
    functionSkills?: FunctionSkill[];
  } = {},
): StyleSkillProfile | null {
  if (!style) return null;
  return {
    name: style.name,
    audience: style.audience || "",
    tone: style.tone || "",
    structure_template: style.structure_template || "",
    emphasis_points: Array.isArray(style.emphasis_points) ? style.emphasis_points.filter(Boolean) : [],
    citation_policy: style.citation_policy || "auto",
    title_policy: style.title_policy || "retain",
    image_focus: style.image_focus || "auto",
    layout_format: style.layout_format || "auto",
    visual_mode: style.visual_mode || "auto",
    function_skills: Array.isArray(options.functionSkills) ? options.functionSkills.slice(0, 8) : [],
  };
}

export function createStyleTemplate(input: Pick<StyleTemplate, "id" | "name" | "prompt"> & Partial<StyleTemplate>): StyleTemplate {
  return {
    ...createStyleSkillDefaults(input.name),
    ...input,
    audience: input.audience || "",
    tone: input.tone || "",
    structure_template: input.structure_template || "",
    emphasis_points: Array.isArray(input.emphasis_points) ? input.emphasis_points.filter(Boolean) : [],
    citation_policy: input.citation_policy || "auto",
    title_policy: input.title_policy || "retain",
    image_focus: input.image_focus || "auto",
    layout_format: input.layout_format || "auto",
    visual_mode: input.visual_mode || "auto",
  };
}
