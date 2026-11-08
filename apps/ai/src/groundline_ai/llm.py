"""Text generation with provider fallback.

OpenAI answers first; DeepSeek, which serves the same Responses API, takes over when
OpenAI is unreachable, rate limited, failing, or not configured. Both go through the
OpenAI SDK, so the request shape is identical.
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Any

from openai import APIConnectionError, APIStatusError, APITimeoutError, AsyncOpenAI

from groundline_ai.config import Settings

log = logging.getLogger(__name__)


class LLMUnavailable(Exception):
    """Every configured provider failed (or none is configured)."""


@dataclass
class Provider:
    name: str
    model: str
    client: AsyncOpenAI


@dataclass
class ToolCallRequest:
    call_id: str
    name: str
    #: JSON-encoded arguments, exactly as the model produced them.
    arguments: str


@dataclass
class Completion:
    text: str
    provider: str
    model: str
    input_tokens: int | None
    output_tokens: int | None
    latency_ms: int
    fell_back: bool
    tool_calls: list[ToolCallRequest] = field(default_factory=list)


def build_providers(settings: Settings) -> list[Provider]:
    providers: list[Provider] = []
    if settings.openai_api_key:
        providers.append(
            Provider(
                "openai",
                settings.openai_chat_model,
                AsyncOpenAI(
                    api_key=settings.openai_api_key,
                    timeout=settings.llm_timeout_seconds,
                    max_retries=1,
                ),
            )
        )
    if settings.deepseek_api_key:
        providers.append(
            Provider(
                "deepseek",
                settings.deepseek_chat_model,
                AsyncOpenAI(
                    api_key=settings.deepseek_api_key,
                    base_url=settings.deepseek_base_url,
                    timeout=settings.llm_timeout_seconds,
                    max_retries=1,
                ),
            )
        )
    return providers


# Errors where another provider may well succeed. A 400 means our request is wrong for that
# provider; it's still worth trying the next one so customers get an answer, but it's logged
# as an error because it needs fixing.
_FALLBACK_ERRORS = (APIConnectionError, APITimeoutError, APIStatusError)


async def complete(
    providers: list[Provider],
    *,
    instructions: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    max_output_tokens: int = 2000,
) -> Completion:
    """One model turn. With `tools`, the model may answer with tool calls instead of text."""
    if not providers:
        raise LLMUnavailable(
            "No language model is configured. Set OPENAI_API_KEY or DEEPSEEK_API_KEY."
        )

    for position, provider in enumerate(providers):
        started = time.perf_counter()
        try:
            response = await provider.client.responses.create(
                model=provider.model,
                instructions=instructions,
                input=messages,
                max_output_tokens=max_output_tokens,
                **({"tools": tools} if tools else {}),
            )
        except _FALLBACK_ERRORS as err:
            status = getattr(err, "status_code", None)
            # Bad keys and malformed requests need fixing; outages and rate limits are transient.
            level = logging.ERROR if status in (400, 401, 403, 404, 422) else logging.WARNING
            log.log(level, "%s failed (%s): %s", provider.name, status or type(err).__name__, err)
            continue

        tool_calls = [
            ToolCallRequest(call_id=item.call_id, name=item.name, arguments=item.arguments or "{}")
            for item in (getattr(response, "output", None) or [])
            if getattr(item, "type", None) == "function_call"
        ]
        text = (response.output_text or "").strip()
        if not text and not tool_calls:
            log.warning("%s returned no text (status %s)", provider.name, response.status)
            continue
        usage = response.usage
        return Completion(
            text=text,
            provider=provider.name,
            model=response.model or provider.model,
            input_tokens=usage.input_tokens if usage else None,
            output_tokens=usage.output_tokens if usage else None,
            latency_ms=int((time.perf_counter() - started) * 1000),
            fell_back=position > 0,
            tool_calls=tool_calls,
        )
    raise LLMUnavailable("All language model providers failed.")
