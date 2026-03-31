# Root Cause Analysis — Experiment 1

> Generated: 2026-03-31 05:19:59 | Classification: narrow — Removing the `await Task.Delay(1000)` on line 42 is a single-line deletion within one file's method body, with no dependency, API contract, or architectural changes.

| Metric | Current | Baseline |
|--------|---------|----------|
| p95 Latency | 1014.90584ms | 1014.90584ms |
| Requests/sec | 114.9 | 114.9 |
| Error Rate | 0% | 0% |

---
# Remove artificial 1-second Task.Delay in catalog list endpoint

> **File:** `src/PublicApi/CatalogItemEndpoints/CatalogItemListPagedEndpoint.cs` | **Scope:** narrow

## Evidence

At `CatalogItemListPagedEndpoint.cs:42`, the handler begins with:

```csharp
await Task.Delay(1000);
```

This introduces a hard-coded 1-second sleep on every paginated catalog list request. The current p95 latency is 1014.9ms, which almost exactly matches this delay plus minimal DB/serialization overhead.

## Theory

The `Task.Delay(1000)` forces every catalog-items list request to take at least 1000ms regardless of actual workload. Since the k6 scenario calls `GET /api/catalog-items` once per iteration (≈14.3% of all requests), this creates a guaranteed latency floor of 1000ms for a significant share of traffic. Under load with 50 concurrent VUs, this also holds thread-pool / async continuations for 1 second each, amplifying queuing delays across all endpoints. The p95 of 1014.9ms is almost entirely explained by this artificial delay.

## Proposed Fixes

1. **Remove the `Task.Delay(1000)` call:** Delete line 42 of `CatalogItemListPagedEndpoint.cs`. No other code depends on this delay.

## Expected Impact

- p95 latency: should drop from ~1015ms to ~50-150ms (the natural DB + serialization cost)
- RPS: should increase significantly as the bottleneck is removed
- Estimated overall p95 improvement: 80-90%, since this delay dominates the p95 distribution

