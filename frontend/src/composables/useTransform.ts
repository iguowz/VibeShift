import { computed, ref } from "vue";
import axios from "axios";

import { estimateCost, regenerateImage, resolveApiError, submitTransform, testProviderConnection } from "../lib/api";
import type {
  ApiError,
  CostEstimatePayload,
  CostEstimateResponse,
  CostPricingSettings,
  ImageConfig,
  LLMConfig,
  TransformPayload,
  TransformResponse,
} from "../types";

export function useTransform() {
  const loading = ref(false);
  const testing = ref(false);
  const regeneratingImageId = ref<string | null>(null);
  const estimatingCost = ref(false);
  const generatingImages = ref(false);
  const imageProgress = ref<{ completed: number; total: number; eta_seconds: number | null } | null>(null);
  const errorMessage = ref("");
  const errorSuggestion = ref("");
  const costErrorMessage = ref("");
  const costErrorSuggestion = ref("");
  const providerTestMessage = ref("");
  const result = ref<TransformResponse | null>(null);
  const costEstimateResult = ref<CostEstimateResponse | null>(null);
  let controller: AbortController | null = null;
  let costController: AbortController | null = null;
  let imagesController: AbortController | null = null;

  function resetError() {
    errorMessage.value = "";
    errorSuggestion.value = "";
  }

  function resetCostError() {
    costErrorMessage.value = "";
    costErrorSuggestion.value = "";
  }

  function normalizeImageConfig(imageConfig: ImageConfig, llmConfig: LLMConfig): ImageConfig {
    return {
      ...imageConfig,
      enabled: true,
      provider: imageConfig.provider || llmConfig.provider,
      base_url: imageConfig.base_url || llmConfig.base_url,
      api_key: imageConfig.api_key || llmConfig.api_key,
      model: imageConfig.model || "gpt-image-1",
    };
  }

  function buildPricing(settings: CostPricingSettings) {
    if (!settings.enabled) return null;
    if (!(settings.prompt_usd_per_1k > 0) || !(settings.completion_usd_per_1k > 0)) return null;
    return {
      prompt_usd_per_1k: settings.prompt_usd_per_1k,
      completion_usd_per_1k: settings.completion_usd_per_1k,
      image_usd_each: settings.image_usd_each,
    };
  }

  async function run(payload: TransformPayload) {
    controller?.abort();
    imagesController?.abort();
    controller = new AbortController();
    loading.value = true;
    generatingImages.value = false;
    imageProgress.value = null;
    resetError();
    providerTestMessage.value = "";

    try {
      const transformPayload: TransformPayload = payload.image.enabled
        ? {
            ...payload,
            image: {
              ...payload.image,
              async_generation: true,
            },
          }
        : payload;

      result.value = await submitTransform(transformPayload, controller.signal);
      loading.value = false;

      const prompts = result.value.image_prompts || [];
      if (payload.image.enabled && prompts.length) {
        imagesController = new AbortController();
        generatingImages.value = true;
        imageProgress.value = { completed: 0, total: prompts.length, eta_seconds: null };

        const startedAt = Date.now();
        try {
          for (let index = 0; index < prompts.length; index += 1) {
            const currentResult: TransformResponse | null = result.value;
            if (!currentResult) break;

            const imageId = `img_${index + 1}`;
            regeneratingImageId.value = imageId;
            const generated = await regenerateImage(
              {
                image_id: imageId,
                prompt: prompts[index],
                image: normalizeImageConfig(payload.image, payload.llm),
              },
              imagesController.signal,
            );

            const nextImages = [...currentResult.images.filter((item) => item.id !== imageId), generated].sort((a, b) =>
              a.id.localeCompare(b.id),
            );
            result.value = { ...currentResult, images: nextImages };

            const completed = index + 1;
            const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
            const avg = elapsedSeconds / completed;
            const remaining = prompts.length - completed;
            imageProgress.value = {
              completed,
              total: prompts.length,
              eta_seconds: remaining > 0 ? Math.max(1, Math.round(avg * remaining)) : 0,
            };
          }
        } catch (error) {
          if (axios.isCancel(error)) {
            errorMessage.value = "图片生成已取消。";
            errorSuggestion.value = "你可以调整插图配置后重新生成。";
          } else {
            const apiError = (error as { response?: { data?: ApiError } }).response?.data?.error;
            errorMessage.value = apiError?.message || "图片生成失败。";
            errorSuggestion.value = apiError?.suggestion || "请检查图像模型配置，或稍后重试。";
          }
        } finally {
          generatingImages.value = false;
          regeneratingImageId.value = null;
        }
      }
    } catch (error) {
      if (axios.isCancel(error)) {
        errorMessage.value = "请求已取消。";
        errorSuggestion.value = "你可以调整配置后重新提交。";
      } else {
        const resolvedError = resolveApiError(
          error,
          "请求失败，未获取到转换结果。",
          "请检查输入、网络或模型配置。",
        );
        errorMessage.value = resolvedError.message;
        errorSuggestion.value = resolvedError.suggestion;
      }
    } finally {
      loading.value = false;
    }
  }

  function cancel() {
    controller?.abort();
    imagesController?.abort();
    loading.value = false;
    generatingImages.value = false;
    regeneratingImageId.value = null;
    imageProgress.value = null;
  }

  async function testProvider(payload: { llm: TransformPayload["llm"] }) {
    testing.value = true;
    providerTestMessage.value = "";
    resetError();
    try {
      const response = await testProviderConnection(payload);
      providerTestMessage.value = response.message;
    } catch (error) {
      const apiError = (error as { response?: { data?: ApiError } }).response?.data?.error;
      errorMessage.value = apiError?.message || "连接测试失败。";
      errorSuggestion.value = apiError?.suggestion || "请检查模型服务配置。";
    } finally {
      testing.value = false;
    }
  }

  const hasResult = computed(() => !!result.value);

  async function estimate(payload: Omit<CostEstimatePayload, "pricing">, pricingSettings: CostPricingSettings) {
    costController?.abort();
    costController = new AbortController();
    estimatingCost.value = true;
    resetCostError();
    costEstimateResult.value = null;
    try {
      const pricing = buildPricing(pricingSettings);
      costEstimateResult.value = await estimateCost(
        {
          ...payload,
          pricing,
        },
        costController.signal,
      );
    } catch (error) {
      if (axios.isCancel(error)) {
        costErrorMessage.value = "估算请求已取消。";
        costErrorSuggestion.value = "你可以调整内容或配置后重新估算。";
      } else {
        const apiError = (error as { response?: { data?: ApiError } }).response?.data?.error;
        costErrorMessage.value = apiError?.message || "费用估算失败。";
        costErrorSuggestion.value = apiError?.suggestion || "请检查输入、网络或后端服务状态。";
      }
    } finally {
      estimatingCost.value = false;
    }
  }

  async function regenerateSingleImage(params: {
    image_id: string;
    prompt: string;
    image: ImageConfig;
    llm: LLMConfig;
  }) {
    if (!result.value) return;
    regeneratingImageId.value = params.image_id;
    resetError();

    try {
      const normalizedConfig = normalizeImageConfig(params.image, params.llm);
      const regenerated = await regenerateImage({
        image_id: params.image_id,
        prompt: params.prompt,
        image: normalizedConfig,
      });
      const currentResult = result.value;
      if (!currentResult) return;
      const index = currentResult.images.findIndex((image) => image.id === params.image_id);
      if (index !== -1) {
        const nextImages = currentResult.images.slice();
        nextImages[index] = regenerated;
        result.value = { ...currentResult, images: nextImages };
      }
    } catch (error) {
      const resolvedError = resolveApiError(
        error,
        "图片重新生成失败。",
        "请检查图像模型配置，或稍后重试。",
      );
      errorMessage.value = resolvedError.message;
      errorSuggestion.value = resolvedError.suggestion;
    } finally {
      regeneratingImageId.value = null;
    }
  }

  return {
    loading,
    testing,
    regeneratingImageId,
    estimatingCost,
    generatingImages,
    imageProgress,
    errorMessage,
    errorSuggestion,
    costErrorMessage,
    costErrorSuggestion,
    providerTestMessage,
    result,
    hasResult,
    costEstimateResult,
    run,
    cancel,
    testProvider,
    estimate,
    regenerateSingleImage,
  };
}
