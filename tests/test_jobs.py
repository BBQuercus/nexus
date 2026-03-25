import asyncio
import contextlib

import pytest

from backend.services import jobs as jobs_service


class FakeRedis:
    def __init__(self):
        self.values: dict[str, str] = {}
        self.sorted_sets: dict[str, dict[str, float]] = {}
        self.lists: dict[str, list[str]] = {}

    async def set(self, key: str, value: str):
        self.values[key] = value

    async def get(self, key: str):
        return self.values.get(key)

    async def zadd(self, key: str, mapping: dict[str, float]):
        self.sorted_sets.setdefault(key, {}).update(mapping)

    async def rpush(self, key: str, value: str):
        self.lists.setdefault(key, []).append(value)

    async def blpop(self, key: str, timeout: int = 0):
        queue = self.lists.setdefault(key, [])
        if queue:
            return key, queue.pop(0)
        await asyncio.sleep(0)
        return None

    async def scan_iter(self, pattern: str):
        prefix = pattern[:-1] if pattern.endswith("*") else pattern
        for key in list(self.values):
            if key.startswith(prefix):
                yield key


@pytest.fixture
def reset_job_state():
    jobs_service._active_jobs.clear()
    jobs_service._job_handlers.clear()
    jobs_service._job_queue = asyncio.Queue()
    yield
    jobs_service._active_jobs.clear()
    jobs_service._job_handlers.clear()
    jobs_service._job_queue = asyncio.Queue()


@pytest.mark.asyncio
async def test_enqueue_and_list_jobs_with_redis(monkeypatch, reset_job_state):
    fake_redis = FakeRedis()

    async def fake_get_redis():
        return fake_redis

    monkeypatch.setattr(jobs_service, "get_redis", fake_get_redis)

    job = await jobs_service.enqueue_job("sync-index", {"doc_id": "123"}, user_id="user-1")

    fetched = await jobs_service.get_job(job.id)
    listed = await jobs_service.list_jobs(user_id="user-1")

    assert fetched is not None
    assert fetched.id == job.id
    assert fetched.params == {"doc_id": "123"}
    assert [j.id for j in listed] == [job.id]
    assert fake_redis.lists[jobs_service.JOB_QUEUE_KEY] == [job.id]


@pytest.mark.asyncio
async def test_cancel_job_updates_redis_state(monkeypatch, reset_job_state):
    fake_redis = FakeRedis()

    async def fake_get_redis():
        return fake_redis

    monkeypatch.setattr(jobs_service, "get_redis", fake_get_redis)

    job = await jobs_service.enqueue_job("sync-index", user_id="user-1")
    cancelled = await jobs_service.cancel_job(job.id)

    assert cancelled is not None
    assert cancelled.status == jobs_service.JobStatus.CANCELLED

    fetched = await jobs_service.get_job(job.id)
    assert fetched is not None
    assert fetched.status == jobs_service.JobStatus.CANCELLED
    assert fetched.completed_at is not None


@pytest.mark.asyncio
async def test_process_jobs_uses_redis_queue(monkeypatch, reset_job_state):
    fake_redis = FakeRedis()

    async def fake_get_redis():
        return fake_redis

    monkeypatch.setattr(jobs_service, "get_redis", fake_get_redis)

    @jobs_service.register_job_handler("sync-index")
    async def sync_index(doc_id: str):
        return {"doc_id": doc_id, "status": "done"}

    job = await jobs_service.enqueue_job("sync-index", {"doc_id": "abc"}, user_id="user-1")

    worker = await jobs_service.start_job_worker()
    try:
        for _ in range(50):
            current = await jobs_service.get_job(job.id)
            if current and current.status == jobs_service.JobStatus.COMPLETED:
                break
            await asyncio.sleep(0.01)
        else:
            pytest.fail("job was not processed")
    finally:
        worker.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await worker

    completed = await jobs_service.get_job(job.id)
    assert completed is not None
    assert completed.status == jobs_service.JobStatus.COMPLETED
    assert completed.result == {"doc_id": "abc", "status": "done"}


@pytest.mark.asyncio
async def test_jobs_fall_back_to_in_memory_queue(monkeypatch, reset_job_state):
    async def fake_get_redis():
        return None

    monkeypatch.setattr(jobs_service, "get_redis", fake_get_redis)

    @jobs_service.register_job_handler("local-task")
    async def local_task(value: int):
        return {"value": value * 2}

    job = await jobs_service.enqueue_job("local-task", {"value": 21}, user_id="user-2")

    worker = await jobs_service.start_job_worker()
    try:
        for _ in range(50):
            current = await jobs_service.get_job(job.id)
            if current and current.status == jobs_service.JobStatus.COMPLETED:
                break
            await asyncio.sleep(0.01)
        else:
            pytest.fail("fallback job was not processed")
    finally:
        worker.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await worker

    completed = await jobs_service.get_job(job.id)
    assert completed is not None
    assert completed.result == {"value": 42}
