import pytest

from groundline_ai import evaluation, llm
from groundline_ai.aio import run
from groundline_ai.config import Settings
from groundline_ai.evaluation import EvalCaseRequest, heuristic_grade
from groundline_ai.retrieval import Hit

REFUND = Hit(
    "c1",
    "s-refunds",
    "Refund policy",
    None,
    "Refunds are available within 30 days of purchase.",
    [],
    0.8,
)
SHIPPING = Hit(
    "c2", "s-shipping", "Shipping", None, "Orders ship within two business days.", [], 0.6
)


@pytest.fixture
def no_llm() -> Settings:
    return Settings(openai_api_key="", deepseek_api_key="", embeddings_provider="fake")


@pytest.fixture
def with_llm() -> Settings:
    return Settings(openai_api_key="sk-test", deepseek_api_key="", embeddings_provider="fake")


def completion(text: str) -> llm.Completion:
    return llm.Completion(text, "openai", "gpt-test", 100, 20, 5, False, [])


def test_heuristic_flags_claims_missing_from_the_sources() -> None:
    grade = heuristic_grade(
        "How long do I have to request a refund?",
        "Refunds are available within 30 days of purchase [1]. We also give free lifetime upgrades to everyone.",
        [REFUND.content],
        "You can get a refund within 30 days.",
    )
    assert grade.judge == "heuristic"
    assert grade.groundedness == 0.5
    assert grade.unsupported_claims == ["We also give free lifetime upgrades to everyone."]
    assert grade.relevance >= 0.5
    assert grade.correctness is not None and grade.correctness > 0.5


def test_llm_judge_scores_are_normalised(
    monkeypatch: pytest.MonkeyPatch, with_llm: Settings
) -> None:
    calls: list[dict] = []

    async def fake_complete(providers, **kwargs):
        calls.append(kwargs)
        return completion(
            'Sure: {"relevance": 5, "groundedness": 2, "correctness": null, '
            '"unsupported_claims": ["Lifetime upgrades"], "notes": "Invents an upgrade policy."}'
        )

    monkeypatch.setattr(llm, "complete", fake_complete)
    grade = run(
        evaluation.grade(
            "Refunds?", "Yes, plus lifetime upgrades.", [REFUND.content], None, with_llm
        )
    )
    assert (grade.relevance, grade.groundedness, grade.correctness) == (1.0, 0.25, None)
    assert grade.unsupported_claims == ["Lifetime upgrades"]
    assert grade.judge == "openai:gpt-test"
    assert (grade.input_tokens, grade.output_tokens) == (100, 20)
    assert "<sources>" in calls[0]["messages"][0]["content"]


def test_unparseable_judge_reply_falls_back_to_heuristic(
    monkeypatch: pytest.MonkeyPatch, with_llm: Settings
) -> None:
    async def fake_complete(providers, **kwargs):
        return completion("I think it is pretty good.")

    monkeypatch.setattr(llm, "complete", fake_complete)
    grade = run(
        evaluation.grade(
            "Refunds?", "Refunds are available within 30 days.", [REFUND.content], None, with_llm
        )
    )
    assert grade.judge == "heuristic"


def test_case_measures_retrieval_rank_and_grades_the_answer(
    monkeypatch: pytest.MonkeyPatch, no_llm: Settings
) -> None:
    async def fake_search(org, query, settings):
        return [SHIPPING, REFUND]

    async def fake_respond(request, settings, hits=None):
        assert hits == [SHIPPING, REFUND]
        from groundline_ai.agent import AgentResponse

        return AgentResponse(
            status="ANSWERED",
            answer="Refunds are available within 30 days of purchase [2].",
            input_tokens=300,
            output_tokens=40,
            latency_ms=10,
        )

    monkeypatch.setattr(evaluation, "search", fake_search)
    monkeypatch.setattr(evaluation, "respond", fake_respond)
    result = run(
        evaluation.run_case(
            EvalCaseRequest(
                organization_id="o",
                question="What is the refund window?",
                expected_answer="30 days from purchase.",
                expected_source_ids=["s-refunds"],
            ),
            no_llm,
        )
    )
    assert result.retrieved_source_ids == ["s-shipping", "s-refunds"]
    assert result.retrieval_hit is True
    assert result.reciprocal_rank == 0.5
    assert result.grade is not None and result.grade.groundedness == 1.0
    assert (result.input_tokens, result.output_tokens) == (300, 40)


def test_insufficient_answers_are_not_graded(
    monkeypatch: pytest.MonkeyPatch, no_llm: Settings
) -> None:
    async def fake_search(org, query, settings):
        return []

    monkeypatch.setattr(evaluation, "search", fake_search)
    result = run(
        evaluation.run_case(
            EvalCaseRequest(
                organization_id="o",
                question="What's the CEO's home address?",
                expect_insufficient=True,
            ),
            no_llm,
        )
    )
    assert result.status == "INSUFFICIENT_CONTEXT"
    assert result.grade is None
    assert result.retrieval_hit is None
