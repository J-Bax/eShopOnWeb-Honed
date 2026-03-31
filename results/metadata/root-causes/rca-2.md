# Add AsNoTracking to count-only specification

> **File:** `src/ApplicationCore/Specifications/CatalogFilterSpecification.cs` | **Scope:** narrow

## Evidence

At `CatalogFilterSpecification.cs:9-12`, the specification used for COUNT queries lacks `AsNoTracking()`:

```csharp
public CatalogFilterSpecification(int? brandId, int? typeId)
{
    Query.Where(i => (!brandId.HasValue || i.CatalogBrandId == brandId) &&
        (!typeId.HasValue || i.CatalogTypeId == typeId));
}
```

This spec is invoked at `CatalogItemListPagedEndpoint.cs:62-63` when a full page is returned:

```csharp
var filterSpec = new CatalogFilterSpecification(request.CatalogBrandId, request.CatalogTypeId);
totalItems = await itemRepository.CountAsync(filterSpec);
```

The companion `CatalogFilterPaginatedSpecification` already has `.AsNoTracking()` (added in experiment 8, which showed improvement). This spec was missed.

## Theory

When `CountAsync` executes with a tracked specification, EF Core still materializes entity metadata into the change tracker even though only a scalar COUNT is needed. With 12 seed items and pageSize=10, page 0 (half of catalog list requests) returns a full page and triggers this COUNT fallback. The change tracker overhead is unnecessary for a read-only aggregate query.

## Proposed Fixes

1. **Add AsNoTracking to query chain:** At `CatalogFilterSpecification.cs:11`, append `.AsNoTracking()` after the `.Where(...)` clause, matching the pattern already applied to `CatalogFilterPaginatedSpecification`.

## Expected Impact

- p95 latency: ~0.05ms reduction on affected requests
- Consistent with experiment 8 which showed improvement from the same pattern on the paginated spec
- Affects ~50% of catalog list requests (~7% of total traffic)
