# Add AsNoTracking to duplicate-check specification

> **File:** `src/ApplicationCore/Specifications/CatalogItemNameSpecification.cs` | **Scope:** narrow

## Evidence

At `CatalogItemNameSpecification.cs:8-11`, the specification used for duplicate name checks lacks `AsNoTracking()`:

```csharp
public CatalogItemNameSpecification(string catalogItemName)
{
    Query.Where(item => catalogItemName == item.Name);
}
```

This spec is invoked at `CreateCatalogItemEndpoint.cs:43-44` for every POST request:

```csharp
var catalogItemNameSpecification = new CatalogItemNameSpecification(request.Name);
var existingCataloogItem = await itemRepository.CountAsync(catalogItemNameSpecification);
```

Every item creation triggers a `CountAsync` with change tracking enabled, even though this is a read-only existence check.

## Theory

The duplicate name check is a read-only query that only needs a scalar count. Change tracking adds overhead by preparing to track any matched entities in the identity map. Since the k6 test creates a new item every iteration (~14.3% of all traffic), this overhead applies to a significant portion of requests. Adding `AsNoTracking()` eliminates unnecessary change tracker participation.

## Proposed Fixes

1. **Add AsNoTracking to query chain:** At `CatalogItemNameSpecification.cs:10`, append `.AsNoTracking()` after the `.Where(...)` clause.

## Expected Impact

- p95 latency: ~0.03-0.05ms reduction on create requests
- Reduces allocation pressure from change tracker on write path
- Affects ~14.3% of total traffic (every POST /api/catalog-items)
