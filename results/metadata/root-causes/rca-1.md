# Add memory cache to CatalogTypeListEndpoint

> **File:** `src/PublicApi/CatalogTypeEndpoints/CatalogTypeListEndpoint.cs` | **Scope:** narrow

## Evidence

At `CatalogTypeListEndpoint.cs:40`, every request hits the database:

```csharp
var items = await catalogTypeRepository.ListAsync();
```

Meanwhile, the sibling `CatalogBrandListEndpoint.cs:48-52` already uses `IMemoryCache` with a 30-second TTL:

```csharp
if (!_cache.TryGetValue(CacheKey, out List<CatalogBrandDto>? cachedBrands) || cachedBrands == null)
{
    var items = await catalogBrandRepository.ListAsync();
    cachedBrands = items.Select(_mapper.Map<CatalogBrandDto>).ToList();
    _cache.Set(CacheKey, cachedBrands, CacheTtl);
}
```

Catalog types are static reference data that rarely changes, yet every k6 iteration issues a `GET /api/catalog-types` request (part of the batched trio), accounting for ~10% of all traffic. Each call allocates a new list and round-trips through EF Core.

## Theory

Under load (up to 12 concurrent VUs), every VU iteration fires a catalog-types query. With no caching, this creates 12 concurrent DB queries per second for data that never changes during the test. This adds unnecessary EF Core overhead (query compilation, materialization, allocations) and contention on the DbContext/connection pool. The brands endpoint already avoids this with caching.

## Proposed Fixes

1. **Add IMemoryCache to CatalogTypeListEndpoint:** Inject `IMemoryCache` (already registered in `Program.cs:55`) and cache the mapped `List<CatalogTypeDto>` with a 30-second TTL, mirroring the pattern in `CatalogBrandListEndpoint`.

## Expected Impact

- p95 latency: ~2-4ms reduction on catalog-type requests
- Eliminates ~10% of DB queries under load
- Reduces EF Core allocations and connection pool pressure