# Eliminate redundant count query in paginated catalog listing

> **File:** `src/PublicApi/CatalogItemEndpoints/CatalogItemListPagedEndpoint.cs` | **Scope:** narrow

## Evidence

At `CatalogItemListPagedEndpoint.cs:44-53`, the list endpoint executes two separate database queries:

```csharp
var filterSpec = new CatalogFilterSpecification(request.CatalogBrandId, request.CatalogTypeId);
int totalItems = await itemRepository.CountAsync(filterSpec);   // line 45 – query 1

var pagedSpec = new CatalogFilterPaginatedSpecification(...);
var items = await itemRepository.ListAsync(pagedSpec);           // line 53 – query 2
```

The `CatalogFilterSpecification` (at `CatalogFilterSpecification.cs:10-11`) applies the same WHERE clause as `CatalogFilterPaginatedSpecification` (at `CatalogFilterPaginatedSpecification.cs:16-17`) but without Skip/Take. Both specs filter on the same `brandId`/`typeId` criteria, resulting in two sequential DB round-trips.

## Theory

The list endpoint is called on every k6 iteration (~10% of traffic). Two sequential queries double the DB interaction time for this endpoint. Since the k6 test passes no `brandId` or `typeId` filters, both queries scan the full Catalog table. The count query is used solely to compute `PageCount` at line 63, which could be derived from a single query or deferred. Under concurrent load, this doubles connection hold time for list requests.

## Proposed Fixes

1. **Use Ardalis.Specification count on the paginated spec:** Add `.Query.EnableCount()` to `CatalogFilterPaginatedSpecification` and use the repository's `CountAsync` on the same specification, or restructure to get count from the same query. Alternatively, compute `PageCount` from the returned items count and skip/take values when possible.

2. **Parallelize with Task.WhenAll:** If two queries are kept, execute `CountAsync` and `ListAsync` concurrently using `Task.WhenAll` instead of sequentially. This requires separate DbContext instances (scoped repository per query) or a simpler approach of just removing the count query.

## Expected Impact

- p95 latency: ~3-5ms reduction on list requests by eliminating one DB round-trip
- Overall p95 improvement: ~1.5-2% from the ~10% traffic share of list requests