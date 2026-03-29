# Root Cause Analysis — Experiment 1

> Generated: 2026-03-29 10:36:31 | Classification: narrow — Classification skipped (SkipClassification = $true)

| Metric | Current | Baseline |
|--------|---------|----------|
| p95 Latency | 1013.98535ms | 1013.98535ms |
| Requests/sec | 115.3 | 115.3 |
| Error Rate | 0% | 0% |

---
# Remove artificial 1-second Task.Delay in catalog list endpoint

> **File:** `src/PublicApi/CatalogItemEndpoints/CatalogItemListPagedEndpoint.cs` | **Scope:** narrow

## Evidence

At `CatalogItemListPagedEndpoint.cs:42`, the handler begins with:

```csharp
await Task.Delay(1000);
```

This introduces a hard-coded 1-second delay on every request to `GET /api/catalog-items`. The current p95 latency is **1013.98ms**, which is almost exactly 1000ms + a small amount of actual DB/processing overhead (~14ms).

## Theory

The `GET /api/catalog-items` endpoint is called once per k6 iteration (1 out of 7 requests, ~14.3% of total traffic). Since p95 means 5% of requests are slower than this value, and 14.3% of all requests hit this endpoint, the catalog-list requests fully populate the p95 tail. The 1-second `Task.Delay` is an artificial bottleneck that dominates the overall p95 latency. It also holds the thread/async context for 1 full second per request, reducing effective throughput under concurrent load—each in-flight request occupies server resources for 1 second longer than needed.

## Proposed Fixes

1. **Remove `Task.Delay(1000)`:** Delete line 42 (`await Task.Delay(1000);`) from `CatalogItemListPagedEndpoint.cs`. No other changes needed—the remaining logic (count query, paginated fetch, mapping) is the actual work.

## Expected Impact

- **p95 latency:** Expected to drop from ~1014ms to ~50-100ms (the actual DB query + mapping time), a reduction of ~900-960ms.
- **RPS:** Should increase significantly since requests complete ~10x faster, freeing up server capacity.
- **Error rate:** No change expected (already 0%).
- Overall p95 improvement of ~90%+ since this endpoint sets the p95 ceiling.

