# Root Cause Analysis — Experiment 8

> Generated: 2026-03-31 06:48:57 | Classification: narrow — Adding AsNoTracking to a read-only Ardalis Specification is a single-file change to the Query builder chain in CatalogFilterPaginatedSpecification.cs, requiring no new dependencies, no API contract changes, and no additional file modifications.

| Metric | Current | Baseline |
|--------|---------|----------|
| p95 Latency | 1.8235ms | 1014.90584ms |
| Requests/sec | 341.7 | 114.9 |
| Error Rate | 0% | 0% |

---
# Add AsNoTracking to read-only paginated catalog specification

> **File:** `src/ApplicationCore/Specifications/CatalogFilterPaginatedSpecification.cs` | **Scope:** narrow

## Evidence

At `CatalogFilterPaginatedSpecification.cs:8-19`, the specification queries CatalogItem entities without disabling change tracking:

```csharp
public CatalogFilterPaginatedSpecification(int skip, int take, int? brandId, int? typeId)
    : base()
{
    Query
        .Where(i => (!brandId.HasValue || i.CatalogBrandId == brandId) &&
        (!typeId.HasValue || i.CatalogTypeId == typeId))
        .Skip(skip).Take(take);
}
```

This specification is consumed by `CatalogItemListPagedEndpoint.cs:50`:

```csharp
var items = await itemRepository.ListAsync(pagedSpec);
```

The `EfRepository<T>` at `EfRepository.cs:6` extends Ardalis `RepositoryBase<T>`, which respects `AsNoTracking()` hints on the specification's query.

## Theory

Without `AsNoTracking()`, EF Core's change tracker creates identity map entries, snapshot copies, and state tracking objects for every returned entity. For the paginated list endpoint returning up to 10 items per request, this means 10 tracked entities per request — all immediately discarded after serialization. Under load (50 concurrent VUs), this creates thousands of short-lived tracking objects per second, amplifying GC pressure.

The 5.9M Gen2 collections in runtime counters suggest excessive object promotion, consistent with change-tracker allocations surviving Gen0/Gen1.

## Proposed Fixes

1. **Add `AsNoTracking()` to the specification query:** In `CatalogFilterPaginatedSpecification.cs`, add `Query.AsNoTracking()` before or after the existing `.Where(...).Skip(skip).Take(take)` chain. Ardalis.Specification supports this directly.

## Expected Impact

- p95 latency: ~0.05-0.1ms reduction per list request from eliminated change tracking overhead
- Memory/GC: fewer short-lived objects, reducing Gen2 collection frequency
- Overall p95 improvement: ~0.5-1%

