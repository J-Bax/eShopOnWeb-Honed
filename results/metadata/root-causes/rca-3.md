# Optimize duplicate name check in create endpoint

> **File:** `src/PublicApi/CatalogItemEndpoints/CreateCatalogItemEndpoint.cs` | **Scope:** narrow

## Evidence

At `CreateCatalogItemEndpoint.cs:43-48`, every create request performs a duplicate name check:

```csharp
var catalogItemNameSpecification = new CatalogItemNameSpecification(request.Name);
var existingCataloogItem = await itemRepository.CountAsync(catalogItemNameSpecification);
if (existingCataloogItem > 0)
{
    throw new DuplicateException($"A catalogItem with name {request.Name} already exists");
}
```

This `CountAsync` scans the Catalog table filtering by `Name` (see `CatalogItemNameSpecification.cs:9`: `Query.Where(item => catalogItemName == item.Name)`). The Name column has no unique index configured in `CatalogItemConfiguration.cs`. Under concurrent load, multiple VUs may create items with colliding names, triggering `DuplicateException` which flows through `ExceptionMiddleware.cs:35-43` returning HTTP 409.

The 16.65% error rate strongly suggests name collisions are occurring frequently under concurrent k6 load.

## Theory

The `CountAsync` query scans all catalog items by name without index support. Under concurrency, race conditions between the check and the insert allow duplicates anyway (TOCTOU), while also causing spurious 409 errors when two VUs generate the same name seed. The exception-throwing path is expensive (stack trace capture, middleware handling). Using `AnyAsync` instead of `CountAsync` would short-circuit after finding the first match rather than counting all matches.

## Proposed Fixes

1. **Replace `CountAsync` with `FirstOrDefaultAsync` or `AnyAsync`:** Instead of counting all matching items, check existence with `AnyAsync` which can short-circuit after the first match. This is semantically equivalent but faster.

2. **Add a HasIndex on Name in CatalogItemConfiguration:** Add `builder.HasIndex(ci => ci.Name)` in `CatalogItemConfiguration.cs` to speed up the name lookup. This helps both the duplicate check and any future name-based queries.

## Expected Impact

- p95 latency: ~1-2ms reduction per create request
- May slightly reduce error rate if query returns faster and narrows the race window
- The error rate improvement would be the bigger win if it prevents some 409s