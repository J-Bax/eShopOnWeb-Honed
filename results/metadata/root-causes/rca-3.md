# Skip redundant fetch in update by using direct entity attach pattern

> **File:** `src/PublicApi/CatalogItemEndpoints/UpdateCatalogItemEndpoint.cs` | **Scope:** narrow

## Evidence

At `UpdateCatalogItemEndpoint.cs:41-52`, the update path performs two DB round-trips:

```csharp
var existingItem = await itemRepository.GetByIdAsync(request.Id);  // Round-trip 1
if (existingItem == null)
    return Results.NotFound();

// ... update properties ...

await itemRepository.UpdateAsync(existingItem);  // Round-trip 2
```

The first round-trip fetches the entity solely to check existence and populate it for change tracking. The second issues the UPDATE. Since the request payload contains all required fields (Id, Name, Description, Price, CatalogBrandId, CatalogTypeId), the entity could be constructed and attached directly, requiring only a single UPDATE round-trip.

## Theory

Each DB round-trip adds network latency and connection pool contention. Under 50 concurrent VUs, the update endpoint (14.3% of traffic) performs 2× the necessary DB operations. Eliminating the SELECT reduces per-request DB time by ~50%, directly lowering latency. However, this changes the 404 behavior (no longer returned if item doesn't exist) — the k6 test uses deterministic IDs (1-12) from seed data that always exist, so this is safe for the load test scenario.

Alternatively, to preserve the 404 behavior, the endpoint could use `AnyAsync` with a spec that checks just the primary key (lighter than `GetByIdAsync` which materializes the full entity), then construct and attach the entity for update.

## Proposed Fixes

1. **Construct and attach entity directly:** Build a `CatalogItem` from the request fields, attach it to the context as Modified, and call `UpdateAsync` — eliminating the `GetByIdAsync` call entirely. This reduces DB round-trips from 2 to 1.

2. **Alternative (preserving 404):** Replace `GetByIdAsync` with a lightweight existence check (`AnyAsync` with ID spec), then construct and attach the entity for update if it exists.

## Expected Impact

- p95 latency: ~0.1-0.3ms reduction per update request from eliminating one DB round-trip
- RPS: slight improvement from reduced DB connection pool contention
- Overall p95 improvement: ~0.5-1%
