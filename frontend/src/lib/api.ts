import axios from "axios";

import type {
  ApiError,
  CostEstimatePayload,
  CostEstimateResponse,
  DiscoverPayload,
  DiscoverResponse,
  ImageRegeneratePayload,
  StylePromptOptimizePayload,
  StylePromptOptimizeResponse,
  TransformPayload,
  TransformResponse,
} from "../types";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  timeout: 180000,
});

const TRANSFORM_TIMEOUT_MS = 1200000;
const DISCOVER_TIMEOUT_MS = 1200000;

export function isRequestCanceled(error: unknown) {
  if (axios.isCancel(error)) return true;
  const candidate = error as { code?: string; name?: string } | null;
  return candidate?.code === "ERR_CANCELED" || candidate?.name === "CanceledError";
}

export function resolveApiError(
  error: unknown,
  fallbackMessage: string,
  fallbackSuggestion: string,
): { message: string; suggestion: string } {
  const candidate = error as {
    code?: string;
    message?: string;
    response?: {
      status?: number;
      data?: ApiError;
    };
  } | null;

  const apiError = candidate?.response?.data?.error;
  if (apiError?.message) {
    return {
      message: apiError.message,
      suggestion: apiError.suggestion || fallbackSuggestion,
    };
  }

  const isDiscoverFallback = fallbackMessage.includes("探索发现");
  const timeoutMessage = isDiscoverFallback ? "探索发现请求超时。" : "转换请求超时。";
  const timeoutSuggestion = isDiscoverFallback
    ? "当前模型响应较慢，请稍后重试；如果使用本地模型，可适当降低输出长度或切换更快模型。"
    : "当前链接抓取或模型生成耗时较长，请稍后重试；如果使用本地模型，可适当降低输出长度、关闭配图或切换更快模型。";
  const gatewayMessage = isDiscoverFallback ? "探索发现耗时过长，网关已超时。" : "转换耗时过长，网关已超时。";
  const gatewaySuggestion = isDiscoverFallback
    ? "当前检索或模型生成耗时较长，请稍后重试；如果使用本地模型，可适当降低输出长度或切换更快模型。"
    : "当前链接处理或模型生成耗时较长，请稍后重试；如果使用本地模型，可适当降低输出长度、关闭配图或切换更快模型。";

  if (candidate?.response?.status === 504) {
    return {
      message: gatewayMessage,
      suggestion: gatewaySuggestion,
    };
  }

  if (candidate?.code === "ECONNABORTED" || (candidate?.message || "").toLowerCase().includes("timeout")) {
    return {
      message: timeoutMessage,
      suggestion: timeoutSuggestion,
    };
  }

  return {
    message: fallbackMessage,
    suggestion: fallbackSuggestion,
  };
}

export async function submitTransform(payload: TransformPayload, signal?: AbortSignal) {
  const response = await api.post<TransformResponse>("/transform", payload, {
    signal,
    timeout: TRANSFORM_TIMEOUT_MS,
  });
  return response.data;
}

export async function testProviderConnection(payload: { llm: TransformPayload["llm"] }, signal?: AbortSignal) {
  const response = await api.post("/providers/test", payload, { signal });
  return response.data as { ok: boolean; message: string };
}

export async function regenerateImage(payload: ImageRegeneratePayload, signal?: AbortSignal) {
  const response = await api.post("/images/regenerate", payload, { signal });
  return response.data as TransformResponse["images"][number];
}

export async function estimateCost(payload: CostEstimatePayload, signal?: AbortSignal) {
  const response = await api.post<CostEstimateResponse>("/cost/estimate", payload, { signal });
  return response.data;
}

export async function submitDiscover(payload: DiscoverPayload, signal?: AbortSignal) {
  const response = await api.post<DiscoverResponse>("/discover", payload, {
    signal,
    timeout: DISCOVER_TIMEOUT_MS,
  });
  return response.data;
}

export async function optimizeStylePrompt(payload: StylePromptOptimizePayload, signal?: AbortSignal) {
  const response = await api.post<StylePromptOptimizeResponse>("/style-prompts/optimize", payload, { signal });
  return response.data;
}
