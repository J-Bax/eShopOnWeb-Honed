# Root Cause Analysis — Experiment 3

> Generated: 2026-03-31 01:20:04 | Classification: narrow — The count query (line 45) and list query (line 53) are independent and can be parallelized with Task.WhenAll entirely within this single file's HandleAsync method, requiring no dependency, API, or architectural changes.

| Metric | Current | Baseline |
|--------|---------|----------|
| p95 Latency | 1.295625ms | 1013.880795ms |
| Requests/sec | 345.9 | 114.9 |
| Error Rate | 28.57% | 0% |

---
# Parallelize count and list queries in paginated catalog endpoint

> **File:** `src/PublicApi/CatalogItemEndpoints/CatalogItemListPagedEndpoint.cs` | **Scope:** narrow

## Evidence

At `CatalogItemListPagedEndpoint.cs:45-54`, two independent DB queries run sequentially:

```csharp
int totalItems = await itemRepository.CountAsync(filterSpec);   // line 46
// ... build pagedSpec ...
var items = await itemRepository.ListAsync(pagedSpec);          // line 54
```

The count query and the paginated list query are independent — neither depends on the other's result.

## Theory

Running these two queries sequentially doubles the DB round-trip time for this endpoint. Under load, each round-trip includes connection pool wait time and query execution. By issuing both queries concurrently with `Task.WhenAll`, the endpoint latency is reduced to the duration of the slower query rather than the sum of both.

## Proposed Fixes

1. **Run both queries concurrently:** Use `Task.WhenAll` to execute `CountAsync` and `ListAsync` in parallel. Build the `pagedSpec` before starting either query, then await both tasks simultaneously.

## Expected Impact

- **Per-request latency reduction:** ~5-15ms (eliminates one sequential round-trip wait).
- **p95 latency:** Modest improvement; becomes meaningful after the Task.Delay is removed.
- **Throughput:** Slightly better DB utilization under concurrency.

