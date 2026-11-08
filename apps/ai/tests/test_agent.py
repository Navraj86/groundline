import pytest

from groundline_ai import agent, llm
from groundline_ai.agent import AgentRequest, ToolSpec, ToolStep, build_input, tool_guidance
from groundline_ai.aio import run
from groundline_ai.config import Settings
from groundline_ai.retrieval import Hit

TOOL = ToolSpec(
    name="list_orders", description="List orders", parameters={"type": "object", "properties": {}}
)
HIT = Hit("c1", "s1", "Refund policy", None, "Refunds within 30 days.", [], 0.8)


@pytest.fixture
def settings() -> Settings:
    return Settings(openai_api_key="", deepseek_api_key="", embeddings_provider="fake")


def patch(
    monkeypatch: pytest.MonkeyPatch, hits: list[Hit], completion: llm.Completion
) -> list[dict]:
    calls: list[dict] = []

    async def fake_search(org, query, s):
        return hits

    async def fake_complete(providers, **kwargs):
        calls.append(kwargs)
        return completion

    monkeypatch.setattr(agent, "search", fake_search)
    monkeypatch.setattr(llm, "complete", fake_complete)
    return calls


def completion(
    text: str = "", tool_calls: list[llm.ToolCallRequest] | None = None
) -> llm.Completion:
    return llm.Completion(text, "openai", "gpt-test", 50, 10, 5, False, tool_calls or [])


def test_returns_tool_calls_for_the_api_to_run(
    monkeypatch: pytest.MonkeyPatch, settings: Settings
) -> None:
    calls = patch(
        monkeypatch, [], completion(tool_calls=[llm.ToolCallRequest("call_1", "list_orders", "{}")])
    )
    result = run(
        agent.respond(
            AgentRequest(
                organization_id="o",
                question="Where is my order?",
                tools=[TOOL],
                customer_signed_in=True,
            ),
            settings,
        )
    )
    assert result.status == "TOOL_CALLS"
    assert result.tool_calls[0].name == "list_orders"
    # Tools are sent as strict functions, even with no matching documentation.
    assert calls[0]["tools"][0] == {**TOOL.model_dump(), "type": "function", "strict": True}


def test_tool_results_are_replayed_as_function_items() -> None:
    request = AgentRequest(
        organization_id="o",
        question="Where is my order?",
        steps=[
            ToolStep(call_id="call_1", name="list_orders", arguments="{}", output='{"result": []}')
        ],
    )
    items = build_input(request)
    assert items[-2] == {
        "type": "function_call",
        "call_id": "call_1",
        "name": "list_orders",
        "arguments": "{}",
    }
    assert items[-1] == {
        "type": "function_call_output",
        "call_id": "call_1",
        "output": '{"result": []}',
    }


def test_final_answer_cites_only_documentation(
    monkeypatch: pytest.MonkeyPatch, settings: Settings
) -> None:
    patch(
        monkeypatch,
        [HIT],
        completion("Your order shipped yesterday. Refunds are possible within 30 days [1]."),
    )
    result = run(
        agent.respond(AgentRequest(organization_id="o", question="refund?", tools=[TOOL]), settings)
    )
    assert result.status == "ANSWERED"
    assert [s.source_id for s in result.sources] == ["s1"]


def test_no_tools_and_no_documentation_skips_the_model(
    monkeypatch: pytest.MonkeyPatch, settings: Settings
) -> None:
    calls = patch(monkeypatch, [], completion("should not be used"))
    result = run(agent.respond(AgentRequest(organization_id="o", question="hi"), settings))
    assert result.status == "INSUFFICIENT_CONTEXT"
    assert calls == []


def test_guidance_reflects_whether_the_customer_is_signed_in() -> None:
    signed_in = tool_guidance(
        AgentRequest(organization_id="o", question="q", tools=[TOOL], customer_signed_in=True)
    )
    anonymous = tool_guidance(AgentRequest(organization_id="o", question="q", tools=[TOOL]))
    assert "signed in, so account tools" in signed_in
    assert "NOT signed in" in anonymous
    assert "pending review" in signed_in
    assert tool_guidance(AgentRequest(organization_id="o", question="q")) == ""
