from types import SimpleNamespace

import httpx
import pytest
from openai import APIConnectionError, InternalServerError

from groundline_ai import llm
from groundline_ai.aio import run


class FakeResponses:
    def __init__(self, outcome):
        self.outcome = outcome
        self.calls = 0

    async def create(self, **kwargs):
        self.calls += 1
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome


def provider(name: str, outcome) -> llm.Provider:
    client = SimpleNamespace(responses=FakeResponses(outcome))
    return llm.Provider(name=name, model=f"{name}-model", client=client)  # type: ignore[arg-type]


def ok(text: str):
    return SimpleNamespace(
        output_text=text,
        status="completed",
        model=None,
        usage=SimpleNamespace(input_tokens=10, output_tokens=5),
    )


REQUEST = httpx.Request("POST", "https://api.example.com/v1/responses")


def complete(providers):
    return run(
        llm.complete(
            providers, instructions="be helpful", messages=[{"role": "user", "content": "hi"}]
        )
    )


def test_primary_answers_when_healthy() -> None:
    primary, fallback = provider("openai", ok("hello")), provider("deepseek", ok("hola"))
    result = complete([primary, fallback])
    assert (result.provider, result.text, result.fell_back) == ("openai", "hello", False)
    assert fallback.client.responses.calls == 0


@pytest.mark.parametrize(
    "error",
    [
        APIConnectionError(request=REQUEST),
        InternalServerError("boom", response=httpx.Response(500, request=REQUEST), body=None),
    ],
)
def test_falls_back_to_deepseek_on_outage(error: Exception) -> None:
    result = complete([provider("openai", error), provider("deepseek", ok("hola"))])
    assert (result.provider, result.text, result.fell_back) == ("deepseek", "hola", True)


def test_empty_output_falls_back() -> None:
    result = complete([provider("openai", ok("")), provider("deepseek", ok("hola"))])
    assert result.provider == "deepseek"


def test_all_failing_raises() -> None:
    with pytest.raises(llm.LLMUnavailable):
        complete([provider("openai", APIConnectionError(request=REQUEST))])
    with pytest.raises(llm.LLMUnavailable):
        complete([])
