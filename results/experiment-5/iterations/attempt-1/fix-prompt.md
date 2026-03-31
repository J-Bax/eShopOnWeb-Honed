Apply this specific optimization to the file and return the complete new file content.

## Target File
src/PublicApi/CatalogTypeEndpoints/CatalogTypeListEndpoint.cs

## Optimization to Apply
Cache static catalog types in memory

## Root Cause Analysis

# Root Cause Analysis — Experiment 5

> Generated: 2026-03-31 06:11:08 | Classification: narrow — A static in-memory cache (e.g., a static list with TTL) can be added entirely within this single endpoint class to avoid repeated DB queries for catalog types, requiring no new dependencies or configuration changes.

| Metric | Current | Baseline |
|--------|---------|----------|
| p95 Latency | 1.77454ms | 1014.90584ms |
| Requests/sec | 341.4 | 114.9 |
| Error Rate | 0% | 0% |

---
# Cache static catalog types in memory

> **File:** `src/PublicApi/CatalogTypeEndpoints/CatalogTypeListEndpoint.cs` | **Scope:** narrow

## Evidence

At `CatalogTypeListEndpoint.cs:40`, every request to `/api/catalog-types` performs a database query for static reference data:

```csharp
var items = await catalogTypeRepository.ListAsync();
```

Catalog types are a tiny, immutable reference table (~4 rows). Like brands, this endpoint is called once per k6 iteration but never uses the already-registered `IMemoryCache` service (`Program.cs:53`).

## Theory

Identical to the brands analysis: under 50 concurrent VUs, hundreds of identical SELECT queries per second hit the types table. Each query incurs DB connection acquisition, EF materialisation, and AutoMapper projection for the same 4 rows. Caching removes all three costs. Combined with brand caching, this eliminates 2 of 7 DB queries per iteration (~28.6% of read traffic), reducing overall DB connection pressure and freeing thread pool threads for write operations.

## Proposed Fixes

1. **Inject `IMemoryCache` and cache type list:** In `CatalogTypeListEndpoint`, inject `IMemoryCache` via the constructor. In `HandleAsync`, use `GetOrCreateAsync` with a short TTL (e.g., 30-60 seconds) to cache the mapped `List<CatalogTypeDto>`. Return cached data on subsequent calls.

## Expected Impact

- p95 latency: ~0.1-0.2ms reduction on affected requests
- RPS: slight improvement from reduced DB connection contention (cumulative with brand caching)
- The `/api/catalog-types` endpoint accounts for ~14.3% of total traffic. Eliminating the DB round-trip should reduce per-request latency by ~0.15ms, yielding ~1-2% overall p95 improvement.




Read the file at the path above (relative to the eShopOnWeb root), apply ONLY the
optimization described, and return the COMPLETE new file in a fenced code block.
No explanation, no commentary — just the code block.
