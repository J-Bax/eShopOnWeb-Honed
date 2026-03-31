# Cache static catalog brands in memory

> **File:** `src/PublicApi/CatalogBrandEndpoints/CatalogBrandListEndpoint.cs` | **Scope:** narrow

## Evidence

At `CatalogBrandListEndpoint.cs:40`, every request to `/api/catalog-brands` executes a full database query:

```csharp
var items = await catalogBrandRepository.ListAsync();
```

Catalog brands are static reference data (~5 rows) that never change during a load test run. Yet every single k6 iteration triggers a fresh DB round-trip. The application already registers `IMemoryCache` at `Program.cs:53`:

```csharp
builder.Services.AddMemoryCache();
```

but no endpoint uses it.

## Theory

Each of the ~50 concurrent VUs calls `/api/catalog-brands` once per iteration, generating hundreds of identical SELECT queries per second against a table that returns the same 5 rows every time. While each query is fast individually, the cumulative DB connection overhead, EF object materialisation, and AutoMapper projection add up — especially under contention. Caching this tiny, immutable dataset in `IMemoryCache` eliminates the DB round-trip, EF tracking, and mapper allocation entirely for the vast majority of requests.

## Proposed Fixes

1. **Inject `IMemoryCache` and cache brand list:** In `CatalogBrandListEndpoint`, inject `IMemoryCache` via the constructor. In `HandleAsync`, use `GetOrCreateAsync` with a short TTL (e.g., 30-60 seconds) to cache the mapped `List<CatalogBrandDto>`. Return the cached list on subsequent calls, skipping the repository and mapper entirely.

## Expected Impact

- p95 latency: ~0.1-0.2ms reduction on affected requests by eliminating DB + EF + AutoMapper overhead
- RPS: slight improvement from reduced DB connection contention
- The `/api/catalog-brands` endpoint accounts for ~14.3% of total traffic (1 of 7 requests per iteration). Eliminating the DB round-trip should reduce per-request latency by ~0.15ms, yielding ~1-2% overall p95 improvement.
