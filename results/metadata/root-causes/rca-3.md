# Eliminate redundant COUNT query in paged catalog listing

> **File:** `src/PublicApi/CatalogItemEndpoints/CatalogItemListPagedEndpoint.cs` | **Scope:** narrow

## Evidence

At `CatalogItemListPagedEndpoint.cs:45-54`, the handler executes two separate database queries:

```csharp
var filterSpec = new CatalogFilterSpecification(request.CatalogBrandId, request.CatalogTypeId);
int totalItems = await itemRepository.CountAsync(filterSpec);    // Query 1: COUNT

var pagedSpec = new CatalogFilterPaginatedSpecification(...);
var items = await itemRepository.ListAsync(pagedSpec);           // Query 2: SELECT with pagination
```

Both queries apply the same brand/type filter, but they are executed sequentially as two independent DB round-trips.

## Theory

Every paginated catalog request makes two DB queries: a COUNT for total items and a SELECT for the page. With only 12 seed items and `pageSize=10`, the total count is trivially small. The COUNT query adds an extra DB round-trip (~3-8ms) on every request. Under concurrent load, this doubles the number of DB connections used by this endpoint, increasing contention.

## Proposed Fixes

1. **Fetch all matching items and derive count from the result:** Since the dataset is small, query without pagination first to get totalItems, then apply in-memory Skip/Take — or use a specification that returns both count and items in a single round-trip. Alternatively, with the Ardalis.Specification library, use a specification that includes a `SELECT COUNT(*) OVER()` window function.

2. **Run both queries concurrently with `Task.WhenAll`:** Execute `CountAsync` and `ListAsync` in parallel rather than sequentially to halve the wall-clock time of the two queries.

## Expected Impact

- p95 latency: ~3-8ms reduction per request from eliminating one round-trip or running them in parallel.
- RPS: Marginal improvement from reduced DB connection hold time.
- Error rate: No change.
