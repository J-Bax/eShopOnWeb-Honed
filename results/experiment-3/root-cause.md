# Root Cause Analysis — Experiment 3

> Generated: 2026-03-31 05:44:17 | Classification: narrow — The optimization modifies only the pagination query logic within the single endpoint handler to avoid a separate COUNT database round-trip, changing internal algorithm without altering the response schema, packages, or requiring multi-file changes.

| Metric | Current | Baseline |
|--------|---------|----------|
| p95 Latency | 2.17126ms | 1014.90584ms |
| Requests/sec | 343.1 | 114.9 |
| Error Rate | 0% | 0% |

---
# Eliminate redundant COUNT query for catalog list pagination

> **File:** `src/PublicApi/CatalogItemEndpoints/CatalogItemListPagedEndpoint.cs` | **Scope:** narrow

## Evidence

At `CatalogItemListPagedEndpoint.cs:45-54`, the handler executes two separate database queries:

```csharp
var filterSpec = new CatalogFilterSpecification(request.CatalogBrandId, request.CatalogTypeId);
int totalItems = await itemRepository.CountAsync(filterSpec);  // Query #1: COUNT

var pagedSpec = new CatalogFilterPaginatedSpecification(...);
var items = await itemRepository.ListAsync(pagedSpec);          // Query #2: SELECT with paging
```

Both queries apply the same WHERE clause (filter by brandId/typeId), meaning the database scans the same table twice with the same filter. The k6 scenario passes no brand/type filters (only `pageSize` and `pageIndex`), so both queries scan the entire `CatalogItems` table.

## Theory

Two sequential DB round-trips per list request doubles the query overhead. For a small dataset (12 seed items), the COUNT is particularly wasteful — the total count could be derived from the result set itself when the dataset is small, or the two queries could be combined. Under concurrent load, this doubles the number of DB connections consumed for the most frequent read endpoint.

## Proposed Fixes

1. **Fetch items first, then compute count from a single query:** When the total number of items is small enough (equal to or less than page size), derive `totalItems` from `items.Count` without a separate COUNT query. Alternatively, restructure to use a specification that returns both count and data in a single round-trip.

## Expected Impact

- Per-request latency for catalog list: reduced by ~3-8ms (one fewer DB round-trip)
- Reduced DB connection contention under load
- Overall p95 improvement: ~0.5-1% after the Task.Delay fix is applied

