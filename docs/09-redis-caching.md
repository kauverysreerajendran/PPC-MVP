# Redis and Caching Standard

## 1. Governing rule

The application must work correctly when Redis is unavailable. Cache is an optimization layer. If a Redis outage takes the application down, the design is wrong. The only exceptions are components where Redis is the intended datastore, such as a job queue or a rate limiter, and those failure modes are handled explicitly.

Add caching after a measured performance problem. Caching applied speculatively adds invalidation complexity and produces stale data defects that are hard to reproduce.

## 2. What to cache

| Suitable | Not suitable |
|---|---|
| Reference data such as master lists, dropdown options, configuration | Anything the user just submitted |
| Expensive aggregates and dashboard counters | Data with legal or financial accuracy requirements unless invalidation is exact |
| Rendered report output that changes daily | Permission and role checks in fast changing systems |
| Third party API responses within their freshness window | Large binary payloads |
| Session data | Data that is cheap to query correctly |
| Rate limit counters | |

## 3. Key naming

Format: `{app}:{env}:{entity}:{identifier}:{variant}`

Examples:

```
erp:prod:user:1042:permissions
erp:prod:invoice:list:company:17:page:1:status:open
erp:prod:report:sales:2026-09:v2
```

Rules:

1. Environment is part of the key. A shared Redis instance across environments without prefixing causes cross environment data leaks.
2. Tenant or company ID is part of any key holding tenant scoped data. This is the most dangerous caching mistake in multi tenant systems.
3. User ID is part of any key holding user specific data.
4. A version segment allows a bulk invalidation by version bump.
5. Keys are built by a helper function, never by string concatenation spread across modules.

## 4. TTL policy

| Data type | TTL |
|---|---|
| Master and reference data | 1 to 24 hours |
| User permissions | 5 to 15 minutes |
| Dashboard aggregates | 1 to 10 minutes |
| List query results | 30 to 120 seconds |
| Third party responses | Per provider freshness, typically 5 to 60 minutes |
| Session | Matches session lifetime |
| Rate limit window | Matches the window |
| Idempotency key | 24 hours |

Every key has a TTL. A key written without an expiry is a memory leak. Vary the TTL by a small random offset so that many keys do not expire at the same moment.

## 5. Patterns

### 5.1 Cache aside

The default pattern. Read from cache, fall through to the database on a miss, write the result back.

```python
def get_master_items(company_id: int):
    key = cache_key("master", "items", company=company_id)
    cached = cache.get(key)
    if cached is not None:
        return cached
    data = MasterItem.objects.filter(company_id=company_id, is_active=True).values()
    cache.set(key, list(data), timeout=3600)
    return data
```

A cache read failure is caught and treated as a miss. It does not raise to the caller.

### 5.2 Invalidation

1. Invalidate on write. Any create, update, or delete on an entity deletes the related keys in the same service method.
2. Group related keys under a version counter when a single write affects many derived keys. Increment the version rather than scanning for keys.
3. `KEYS` is never used in production. Use `SCAN` if a pattern operation is unavoidable, or maintain a tracked key set.
4. If exact invalidation is not achievable, use a short TTL and accept documented staleness rather than building a fragile invalidation web.

### 5.3 Stampede protection

When a popular key expires under load, many requests hit the database at once. Mitigation: a short lock on rebuild, or serve the stale value while one worker refreshes it. Apply this only to keys backed by genuinely expensive queries.

## 6. Other Redis uses

| Use | Notes |
|---|---|
| Session store | Requires persistence configuration. Losing the store logs out every user |
| Celery or RQ broker | Enable persistence. An unpersisted broker loses queued jobs on restart |
| Rate limiting | Fixed or sliding window counters keyed by IP or user |
| Distributed lock | Use a proven implementation with a TTL and an owner token. Never a plain `SETNX` without expiry |
| Idempotency keys | Store request fingerprint and response for a defined window |
| Pub/sub for websockets | Acceptable. Not a durable message queue |

## 7. Operations

| # | Item |
|---|---|
| 7.1 | `maxmemory` configured with an eviction policy. `allkeys-lru` for a pure cache, `noeviction` where Redis holds queues or sessions |
| 7.2 | Separate logical databases or separate instances for cache and for queue or session data, so that cache eviction cannot discard jobs |
| 7.3 | Authentication enabled. Redis never exposed to the public internet |
| 7.4 | TLS enabled for connections crossing a network boundary |
| 7.5 | Connection pooling configured with a socket timeout |
| 7.6 | Monitoring on hit ratio, memory usage, evicted keys, and connected clients |
| 7.7 | A hit ratio below roughly 70 percent indicates the wrong data is being cached or the TTL is too short |

## 8. Anti patterns

1. Caching a query that already runs in 5 ms.
2. Caching without a tenant or user segment in the key, which leaks data between accounts.
3. Caching permissions with a long TTL, which leaves revoked access working.
4. Using the cache as the only copy of data that must survive a restart.
5. Invalidating with `FLUSHDB` because targeted invalidation was not designed.
6. Letting a Redis timeout propagate as a 500 to the user.
