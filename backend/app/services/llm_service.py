import logging

import httpx
from openai import APIConnectionError, APIStatusError, APITimeoutError

from app.core.errors import AppError
from app.core.provider_adapters.openai_compatible import OpenAICompatibleAdapter
from app.core.schemas import LLMConfig


class LLMService:
    def __init__(self) -> None:
        self.logger = logging.getLogger("vibeshift.llm")

    async def rewrite(self, messages: list[dict[str, str]], config: LLMConfig) -> str:
        try:
            adapter = OpenAICompatibleAdapter(config)
            result = await adapter.complete(messages)
        except (httpx.TimeoutException, APITimeoutError) as exc:
            self.logger.warning(
                "llm_timeout provider=%s model=%s base_url=%s error=%s",
                config.provider,
                config.model,
                config.base_url,
                exc.__class__.__name__,
            )
            raise AppError(
                code="llm_timeout",
                message="模型响应超时，未能生成转换结果。",
                suggestion="如果你在使用本地模型，长文场景可适当降低输出长度、切换更快模型，或等待当前模型空闲后重试。",
                status_code=424,
            ) from exc
        except (httpx.RequestError, APIConnectionError) as exc:
            self.logger.warning(
                "llm_connection_error provider=%s model=%s base_url=%s error=%s",
                config.provider,
                config.model,
                config.base_url,
                exc.__class__.__name__,
            )
            raise AppError(
                code="llm_connection_failed",
                message="模型连接失败，未能生成转换结果。",
                suggestion="请检查 Base URL、模型服务是否正在运行，以及容器到模型服务的网络连通性。",
                status_code=424,
            ) from exc
        except APIStatusError as exc:
            self.logger.warning(
                "llm_status_error provider=%s model=%s base_url=%s status=%s",
                config.provider,
                config.model,
                config.base_url,
                exc.status_code,
            )
            raise AppError(
                code="llm_status_error",
                message=f"模型服务返回异常状态 {exc.status_code}，未能生成转换结果。",
                suggestion="请检查模型名称、接口兼容性和服务负载情况，或稍后重试。",
                status_code=424,
            ) from exc
        except Exception as exc:
            self.logger.warning(
                "llm_request_failed provider=%s model=%s base_url=%s error=%s",
                config.provider,
                config.model,
                config.base_url,
                exc.__class__.__name__,
            )
            raise AppError(
                code="llm_request_failed",
                message="模型调用失败，未能生成转换结果。",
                suggestion="请检查 API Key、Base URL、模型名称，或稍后重试。",
                status_code=424,
            ) from exc

        if not result:
            raise AppError(
                code="empty_llm_response",
                message="模型返回为空，未生成有效结果。",
                suggestion="请尝试降低风格指令复杂度，或更换模型后重试。",
                status_code=424,
            )
        return result

    async def test_connection(self, config: LLMConfig) -> list[str]:
        try:
            adapter = OpenAICompatibleAdapter(config)
            return await adapter.list_models()
        except (httpx.TimeoutException, APITimeoutError) as exc:
            self.logger.warning(
                "provider_test_timeout provider=%s model=%s base_url=%s error=%s",
                config.provider,
                config.model,
                config.base_url,
                exc.__class__.__name__,
            )
            raise AppError(
                code="provider_test_timeout",
                message="模型连接测试超时。",
                suggestion="请确认模型服务可访问；如果是本地模型，可等待服务空闲后重试。",
                status_code=424,
            ) from exc
        except Exception as exc:
            self.logger.warning(
                "provider_test_failed provider=%s model=%s base_url=%s error=%s",
                config.provider,
                config.model,
                config.base_url,
                exc.__class__.__name__,
            )
            raise AppError(
                code="provider_test_failed",
                message="模型连接测试失败。",
                suggestion="请核对 Base URL、API Key、模型名称与模型服务是否可用；Docker 部署连接本机模型时可尝试 host.docker.internal。",
                status_code=424,
            ) from exc
