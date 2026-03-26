import pytest
from fastapi import HTTPException

from backend import rate_limit


class FakePipeline:
    def __init__(self, redis_store: dict[str, list[float]]):
        self.redis_store = redis_store
        self.commands: list[tuple] = []

    def zremrangebyscore(self, key: str, min_score: float, max_score: float):
        self.commands.append(("zremrangebyscore", key, min_score, max_score))

    def zcard(self, key: str):
        self.commands.append(("zcard", key))

    def zadd(self, key: str, mapping: dict[str, float]):
        self.commands.append(("zadd", key, mapping))

    def expire(self, key: str, ttl: int):
        self.commands.append(("expire", key, ttl))

    async def execute(self):
        results = []
        for command in self.commands:
            match command[0]:
                case "zremrangebyscore":
                    _, key, _, max_score = command
                    current = self.redis_store.setdefault(key, [])
                    removed = len([score for score in current if score <= max_score])
                    self.redis_store[key] = [score for score in current if score > max_score]
                    results.append(removed)
                case "zcard":
                    _, key = command
                    results.append(len(self.redis_store.setdefault(key, [])))
                case "zadd":
                    _, key, mapping = command
                    self.redis_store.setdefault(key, []).extend(mapping.values())
                    results.append(1)
                case "expire":
                    results.append(True)
        return results


class FakeRedis:
    def __init__(self):
        self.store: dict[str, list[float]] = {}

    def pipeline(self):
        return FakePipeline(self.store)


@pytest.fixture(autouse=True)
def reset_rate_limit_memory():
    rate_limit._memory_requests.clear()
    yield
    rate_limit._memory_requests.clear()


@pytest.mark.asyncio
async def test_check_rate_limit_uses_redis(monkeypatch):
    fake_redis = FakeRedis()

    async def fake_get_redis():
        return fake_redis

    monkeypatch.setattr("backend.redis.get_redis", fake_get_redis)

    for _ in range(3):
        await rate_limit.check_rate_limit("user-1", limit=3, window_seconds=60, category="chat")

    with pytest.raises(HTTPException) as exc:
        await rate_limit.check_rate_limit("user-1", limit=3, window_seconds=60, category="chat")

    assert exc.value.status_code == 429
    assert "too quickly" in exc.value.detail


@pytest.mark.asyncio
async def test_check_rate_limit_falls_back_to_memory_when_redis_fails(monkeypatch):
    async def fake_get_redis():
        return None

    monkeypatch.setattr("backend.redis.get_redis", fake_get_redis)

    await rate_limit.check_rate_limit("user-2", limit=2, window_seconds=60, category="chat")
    await rate_limit.check_rate_limit("user-2", limit=2, window_seconds=60, category="chat")

    with pytest.raises(HTTPException) as exc:
        await rate_limit.check_rate_limit("user-2", limit=2, window_seconds=60, category="chat")

    assert exc.value.status_code == 429
