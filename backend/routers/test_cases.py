import time
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_org, get_current_user, get_org_db
from backend.models import AgentPersona, TestCase, TestRun

router = APIRouter(prefix="/api/test-cases", tags=["test-cases"])


# ── Schemas ──


class CreateTestCaseRequest(BaseModel):
    agent_persona_id: uuid.UUID
    name: str
    input_text: str
    input_variables: dict | None = None
    expected_output: str | None = None
    expected_tool_calls: list[dict] | None = None
    evaluation_criteria: str | None = None


class UpdateTestCaseRequest(BaseModel):
    name: str | None = None
    input_text: str | None = None
    input_variables: dict | None = None
    expected_output: str | None = None
    expected_tool_calls: list[dict] | None = None
    evaluation_criteria: str | None = None


class RunTestsRequest(BaseModel):
    agent_persona_id: uuid.UUID


# ── Helpers ──


def _serialize_test_case(tc: TestCase) -> dict:
    return {
        "id": str(tc.id),
        "org_id": str(tc.org_id),
        "agent_persona_id": str(tc.agent_persona_id),
        "name": tc.name,
        "input_text": tc.input_text,
        "input_variables": tc.input_variables,
        "expected_output": tc.expected_output,
        "expected_tool_calls": tc.expected_tool_calls,
        "evaluation_criteria": tc.evaluation_criteria,
        "created_at": tc.created_at.isoformat() if tc.created_at else None,
        "updated_at": tc.updated_at.isoformat() if tc.updated_at else None,
    }


def _serialize_test_run(tr: TestRun) -> dict:
    return {
        "id": str(tr.id),
        "org_id": str(tr.org_id),
        "agent_persona_id": str(tr.agent_persona_id),
        "triggered_by": str(tr.triggered_by),
        "status": tr.status,
        "total_cases": tr.total_cases,
        "passed": tr.passed,
        "failed": tr.failed,
        "results": tr.results,
        "duration_ms": tr.duration_ms,
        "created_at": tr.created_at.isoformat() if tr.created_at else None,
        "completed_at": tr.completed_at.isoformat() if tr.completed_at else None,
    }


async def _evaluate_test_case(test_case: TestCase, persona) -> dict:
    """Evaluate a test case by calling the LLM with the agent's configuration."""
    import httpx

    from backend.config import settings

    try:
        # Build messages using the agent's system prompt
        messages = [
            {"role": "system", "content": persona.system_prompt or "You are a helpful assistant."},
            {"role": "user", "content": test_case.input_text},
        ]

        # Call LLM (non-streaming for test evaluation)
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{settings.LITE_LLM_URL.rstrip('/')}/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.LITE_LLM_API_KEY}"},
                json={
                    "model": persona.default_model or "gpt-4.1-nano-swc",
                    "messages": messages,
                    "temperature": 0.2,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            actual_output = data["choices"][0]["message"]["content"]

        # Evaluate: check expected output match
        passed = True
        score = 1.0

        if test_case.expected_output:
            expected_lower = test_case.expected_output.lower()
            actual_lower = actual_output.lower()
            # Substring match as a basic check
            passed = expected_lower in actual_lower
            score = 1.0 if passed else 0.0

            # If basic check fails but we have evaluation_criteria, use LLM-as-judge
            if not passed and test_case.evaluation_criteria:
                judge_messages = [
                    {
                        "role": "system",
                        "content": "You are a test evaluator. Respond with ONLY 'PASS' or 'FAIL' followed by a brief reason.",
                    },
                    {
                        "role": "user",
                        "content": f"Evaluation criteria: {test_case.evaluation_criteria}\n\nExpected: {test_case.expected_output}\n\nActual: {actual_output}\n\nDoes the actual output meet the criteria?",
                    },
                ]
                async with httpx.AsyncClient(timeout=30) as client:
                    judge_resp = await client.post(
                        f"{settings.LITE_LLM_URL.rstrip('/')}/v1/chat/completions",
                        headers={"Authorization": f"Bearer {settings.LITE_LLM_API_KEY}"},
                        json={"model": "gpt-4.1-nano-swc", "messages": judge_messages, "temperature": 0},
                    )
                    judge_resp.raise_for_status()
                    verdict = judge_resp.json()["choices"][0]["message"]["content"].strip()
                    passed = verdict.upper().startswith("PASS")
                    score = 1.0 if passed else 0.0

        return {
            "test_case_id": str(test_case.id),
            "test_case_name": test_case.name,
            "passed": passed,
            "actual_output": actual_output,
            "expected_output": test_case.expected_output,
            "score": score,
            "error": None,
        }
    except Exception as e:
        return {
            "test_case_id": str(test_case.id),
            "test_case_name": test_case.name,
            "passed": False,
            "actual_output": None,
            "expected_output": test_case.expected_output,
            "score": 0.0,
            "error": str(e),
        }


# ── Routes ──


@router.get("/runs")
async def list_test_runs(
    agent_persona_id: uuid.UUID = Query(...),
    user_id: uuid.UUID = Depends(get_current_user),
    org_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(
        select(TestRun)
        .where(TestRun.org_id == org_id, TestRun.agent_persona_id == agent_persona_id)
        .order_by(TestRun.created_at.desc())
    )
    runs = result.scalars().all()
    return [_serialize_test_run(r) for r in runs]


@router.get("/runs/{run_id}")
async def get_test_run(
    run_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    org_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(select(TestRun).where(TestRun.id == run_id, TestRun.org_id == org_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Test run not found")
    return _serialize_test_run(run)


@router.get("")
async def list_test_cases(
    agent_persona_id: uuid.UUID = Query(...),
    user_id: uuid.UUID = Depends(get_current_user),
    org_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(
        select(TestCase)
        .where(TestCase.org_id == org_id, TestCase.agent_persona_id == agent_persona_id)
        .order_by(TestCase.created_at.desc())
    )
    cases = result.scalars().all()
    return [_serialize_test_case(c) for c in cases]


@router.post("")
async def create_test_case(
    body: CreateTestCaseRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    org_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_org_db),
):
    test_case = TestCase(
        org_id=org_id,
        agent_persona_id=body.agent_persona_id,
        name=body.name,
        input_text=body.input_text,
        input_variables=body.input_variables,
        expected_output=body.expected_output,
        expected_tool_calls=body.expected_tool_calls,
        evaluation_criteria=body.evaluation_criteria,
    )
    db.add(test_case)
    await db.flush()
    await db.commit()
    return _serialize_test_case(test_case)


@router.get("/{test_case_id}")
async def get_test_case(
    test_case_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    org_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(select(TestCase).where(TestCase.id == test_case_id, TestCase.org_id == org_id))
    test_case = result.scalar_one_or_none()
    if not test_case:
        raise HTTPException(status_code=404, detail="Test case not found")
    return _serialize_test_case(test_case)


@router.patch("/{test_case_id}")
async def update_test_case(
    test_case_id: uuid.UUID,
    body: UpdateTestCaseRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    org_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(select(TestCase).where(TestCase.id == test_case_id, TestCase.org_id == org_id))
    test_case = result.scalar_one_or_none()
    if not test_case:
        raise HTTPException(status_code=404, detail="Test case not found")

    for field_name, value in body.model_dump(exclude_unset=True).items():
        setattr(test_case, field_name, value)

    await db.commit()
    return _serialize_test_case(test_case)


@router.delete("/{test_case_id}")
async def delete_test_case(
    test_case_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    org_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(select(TestCase).where(TestCase.id == test_case_id, TestCase.org_id == org_id))
    test_case = result.scalar_one_or_none()
    if not test_case:
        raise HTTPException(status_code=404, detail="Test case not found")

    await db.delete(test_case)
    await db.commit()
    return {"ok": True}


@router.post("/run")
async def run_tests(
    body: RunTestsRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    org_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_org_db),
):
    # Fetch all test cases for the agent
    result = await db.execute(
        select(TestCase).where(
            TestCase.org_id == org_id,
            TestCase.agent_persona_id == body.agent_persona_id,
        )
    )
    cases = result.scalars().all()
    if not cases:
        raise HTTPException(status_code=400, detail="No test cases found for this agent")

    # Fetch agent persona for system prompt and model
    persona_result = await db.execute(select(AgentPersona).where(AgentPersona.id == body.agent_persona_id))
    persona = persona_result.scalar_one_or_none()
    if not persona:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Create the test run
    test_run = TestRun(
        org_id=org_id,
        agent_persona_id=body.agent_persona_id,
        triggered_by=user_id,
        status="running",
        total_cases=len(cases),
    )
    db.add(test_run)
    await db.flush()

    # Run each test case
    start_time = time.monotonic()
    results = []
    passed_count = 0
    failed_count = 0

    for tc in cases:
        try:
            evaluation = await _evaluate_test_case(tc, persona)
            results.append(evaluation)
            if evaluation["passed"]:
                passed_count += 1
            else:
                failed_count += 1
        except Exception as e:
            results.append(
                {
                    "test_case_id": str(tc.id),
                    "test_case_name": tc.name,
                    "passed": False,
                    "actual_output": None,
                    "expected_output": tc.expected_output,
                    "score": 0.0,
                    "error": str(e),
                }
            )
            failed_count += 1

    duration_ms = int((time.monotonic() - start_time) * 1000)

    test_run.status = "completed"
    test_run.passed = passed_count
    test_run.failed = failed_count
    test_run.results = results
    test_run.duration_ms = duration_ms
    test_run.completed_at = datetime.now(UTC)

    await db.commit()
    return _serialize_test_run(test_run)
