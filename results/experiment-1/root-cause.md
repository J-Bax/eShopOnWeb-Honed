# Root Cause Analysis — Experiment 1

> Generated: 2026-03-31 00:56:57 | Classification: narrow — Removing the artificial `Task.Delay(1000)` on line 42 is a single-line deletion within one file's method body, with no dependency, API contract, or architectural changes.

| Metric | Current | Baseline |
|--------|---------|----------|
| p95 Latency | 1013.880795ms | 1013.880795ms |
| Requests/sec | 114.9 | 114.9 |
| Error Rate | 0% | 0% |

---
# Remove artificial Task.Delay(1000) from catalog list endpoint

> **File:** `src/PublicApi/CatalogItemEndpoints/CatalogItemListPagedEndpoint.cs` | **Scope:** narrow

## Evidence

At `CatalogItemListPagedEndpoint.cs:42`, the handler begins with:

```csharp
await Task.Delay(1000);
```

This introduces a hardcoded 1-second sleep on every request to `GET /api/catalog-items`. The current p95 latency is **1013.88ms**, which is almost exactly 1000ms plus minimal DB/framework overhead (~14ms).

## Theory

The `Task.Delay(1000)` adds a flat 1-second floor to every paginated catalog list request. Since this endpoint is hit once per k6 iteration (~14.3% of all requests), it dominates the p95 latency distribution. Under concurrency, this delay also holds ASP.NET thread-pool continuations longer than necessary, reducing overall throughput. The entire observed p95 is effectively explained by this single line.

## Proposed Fixes

1. **Remove the `Task.Delay(1000)` call:** Delete line 42 entirely. The endpoint should proceed directly to building the response and querying the repository.

## Expected Impact

- **p95 latency:** Should drop from ~1014ms to ~14-50ms (the actual DB query + serialization time), a reduction of ~1000ms.
- **RPS:** Should increase significantly as requests complete ~70x faster on this endpoint, freeing concurrency capacity.
- Overall p95 improvement: ~95%+ since this endpoint sets the p95 ceiling.

