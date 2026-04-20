# Eliminate redundant count query in paged listing

> **File:** `src/PublicApi/CatalogItemEndpoints/CatalogItemListPagedEndpoint.cs` | **Scope:** narrow

## Evidence

At `CatalogItemListPagedEndpoint.cs:44-53`, two separate DB queries are executed sequentially:

```csharp
var filterSpec = new CatalogFilterSpecification(request.CatalogBrandId, request.CatalogTypeId);
int totalItems = await itemRepository.CountAsync(filterSpec);

var pagedSpec = new CatalogFilterPaginatedSpecification(...);
var items = await itemRepository.ListAsync(pagedSpec);
```

The first query (`CountAsync`) scans matching rows just to compute `PageCount`. The second query fetches the actual page. Both apply the same filter predicate. This doubles the DB round-trips for the list endpoint.

Additionally at line 63, the page count calculation uses an unnecessary `ToString()` round-trip:
```csharp
response.PageCount = int.Parse(Math.Ceiling((decimal)totalItems / request.PageSize).ToString());
```

## Theory

Each list request (10% of traffic) executes two DB queries when one would suffice. Under concurrency, this doubles connection pool usage for this endpoint. The count query scans rows without benefiting from the pagination limit. For the k6 scenario where no brand/type filters are applied, the count query scans the entire Catalog table.

## Proposed Fixes

1. **Remove the count query and derive PageCount from the result set:** Since `pageSize` is 8 and the dataset is small, fetch `pageSize + 1` items (or use a known total from a cached count). If fewer than `pageSize` items are returned, it's the last page. Alternatively, use Ardalis.Specification's built-in pagination support that can return count + items in one query.

2. **Simplify PageCount calculation:** Replace `int.Parse(Math.Ceiling(...).ToString())` with `(int)Math.Ceiling((double)totalItems / request.PageSize)` to avoid string allocation.

## Expected Impact

- p95 latency: ~3-5ms reduction per list request by eliminating one DB round-trip
- Reduces connection pool contention under load
- Minor allocation reduction from fixing the PageCount calculation