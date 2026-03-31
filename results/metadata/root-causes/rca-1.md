# Remove artificial 1-second Task.Delay in catalog list endpoint

> **File:** `src/PublicApi/CatalogItemEndpoints/CatalogItemListPagedEndpoint.cs` | **Scope:** narrow

## Evidence

At `CatalogItemListPagedEndpoint.cs:42`, the handler begins with:

```csharp
await Task.Delay(1000);
```

This injects a **hard-coded 1-second sleep** into every paged catalog list request. The k6 scenario calls `GET /api/catalog-items?pageSize=10&pageIndex={0|1}` once per iteration, making it ~14.3% of the 7 requests per VU iteration. With a current p95 of ~1014ms, this single delay accounts for nearly all of the observed latency on this endpoint.

## Theory

Every request to the paginated catalog endpoint pays an unconditional 1000ms penalty before any real work begins. Under load (up to 50 concurrent VUs), this ties up threads/connections for a full second each, dramatically inflating p95 latency and reducing throughput. Since this endpoint is the heaviest read operation (it runs both a `CountAsync` and a `ListAsync` after the delay), the 1s floor dominates the response time.

## Proposed Fixes

1. **Remove the `Task.Delay(1000)` call:** Delete line 42 entirely. The surrounding logic (filter spec, count, paged query, mapping) is the intended implementation and needs no delay.

## Expected Impact

- p95 latency: ~1000ms reduction on this endpoint; overall p95 should drop significantly since this endpoint sets the latency ceiling for the entire test iteration.
- RPS: Should increase substantially as thread utilization improves.
- Error rate: No change expected (currently 0%).
