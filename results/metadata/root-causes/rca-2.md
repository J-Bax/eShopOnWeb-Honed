# Cache static catalog brands to eliminate repeated DB queries

> **File:** `src/PublicApi/CatalogBrandEndpoints/CatalogBrandListEndpoint.cs` | **Scope:** narrow

## Evidence

At `CatalogBrandListEndpoint.cs:40`, every request fetches all brands from the database:

```csharp
var items = await catalogBrandRepository.ListAsync(); // line 40
```

Similarly at `CatalogTypeListEndpoint.cs:40`:

```csharp
var items = await catalogTypeRepository.ListAsync(); // line 40
```

Catalog brands and types are reference data that rarely change. The application already registers `AddMemoryCache()` at `Program.cs:55` but never uses it for these endpoints.

## Theory

Brands and types are fetched on every k6 iteration as part of the batched GET requests, accounting for ~20% of total traffic. These are small, static lookup tables. Querying the database for unchanged data on every request wastes DB connections and adds unnecessary latency. Under load with 12 VUs, this means ~12 concurrent unnecessary DB queries per second for data that could be served from memory.

## Proposed Fixes

1. **Add in-memory caching:** Inject `IMemoryCache` into `CatalogBrandListEndpoint` and cache the brand list with a short TTL (e.g., 30-60 seconds). Check cache before calling `catalogBrandRepository.ListAsync()`. The same pattern should be applied to `CatalogTypeListEndpoint` in a separate opportunity if needed, but this file focuses on brands.

## Expected Impact

- p95 latency: ~2-4ms reduction per brands request by serving from cache
- DB connection pool pressure reduced by eliminating ~10% of all DB queries
- Overall p95 improvement: ~2-3% from direct latency savings plus indirect benefit from reduced DB contention