# Eliminate redundant COUNT query for catalog pagination

> **File:** `src/PublicApi/CatalogItemEndpoints/CatalogItemListPagedEndpoint.cs` | **Scope:** narrow

## Evidence

At `CatalogItemListPagedEndpoint.cs:45-54`, the handler executes two separate database queries:

```csharp
var filterSpec = new CatalogFilterSpecification(request.CatalogBrandId, request.CatalogTypeId);
int totalItems = await itemRepository.CountAsync(filterSpec);    // Line 46 — Query 1: COUNT

var pagedSpec = new CatalogFilterPaginatedSpecification(...);
var items = await itemRepository.ListAsync(pagedSpec);           // Line 54 — Query 2: SELECT
```

Both queries apply the same brand/type filter but are executed as separate DB round trips. The `CatalogFilterSpecification` (at `CatalogFilterSpecification.cs:8-12`) and `CatalogFilterPaginatedSpecification` (at `CatalogFilterPaginatedSpecification.cs:6-19`) use identical WHERE clauses.

## Theory

Two sequential DB queries where one would suffice doubles the query overhead for this endpoint. For small datasets (seed data has ~12 items), the COUNT query itself is fast, but the round-trip overhead and connection acquisition add latency. Under high concurrency (50 VUs), the extra queries increase DB connection pool contention and total query volume. After removing `Task.Delay`, this becomes one of the few remaining sources of optimization.

## Proposed Fixes

1. **Compute page count from fetched results:** For the common case where datasets are small and `pageSize=10`, fetch a slightly larger window or use the items list length to infer total count. Alternatively, combine count and fetch into a single spec that returns both. The simplest approach: since the k6 test passes no brand/type filters, compute `totalItems` from the result set size and skip/take values when the result count is less than `pageSize` (indicating last page), otherwise make a single combined query.

2. **Use Ardalis.Specification's built-in pagination support:** Restructure the specification to use `.Take()` and `.Skip()` with a single query that also returns the count, reducing to one DB round trip.

## Expected Impact

- **p95 latency:** Saves ~3-8ms per catalog-list request (one fewer DB round trip).
- **RPS:** Minor improvement from reduced DB load.
- **Overall p95 improvement:** ~1-2% after the Task.Delay fix is applied.
