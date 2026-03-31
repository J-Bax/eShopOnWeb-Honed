# Root Cause Analysis — Experiment 10

> Generated: 2026-03-31 07:04:07 | Classification: narrow — Changing `AddDbContext<CatalogContext>` to `AddDbContextPool<CatalogContext>` is a single-file method call swap within Dependencies.cs, requiring no new packages, no schema changes, and no public API alterations.

| Metric | Current | Baseline |
|--------|---------|----------|
| p95 Latency | 1.80614ms | 1014.90584ms |
| Requests/sec | 341.7 | 114.9 |
| Error Rate | 0% | 0% |

---
# Enable DbContext pooling for CatalogContext

> **File:** `src/Infrastructure/Dependencies.cs` | **Scope:** narrow

## Evidence

At `Dependencies.cs:32-33`, the CatalogContext is registered with standard `AddDbContext`:

```csharp
services.AddDbContext<CatalogContext>(c =>
    c.UseSqlServer(configuration.GetConnectionString("CatalogConnection")));
```

Runtime counters show **5,908,376 Gen2 GC collections** despite only 0.59% CPU usage. Every request to catalog endpoints (list, get-by-id, update, create, brands) creates a new `CatalogContext` instance and disposes it, generating continuous allocation pressure across all hot paths.

The `CatalogContext` constructor at `CatalogContext.cs:12` only accepts `DbContextOptions<CatalogContext>`, making it fully compatible with pooling:

```csharp
public CatalogContext(DbContextOptions<CatalogContext> options) : base(options) {}
```

## Theory

Each scoped `CatalogContext` allocation includes internal EF Core infrastructure (change tracker, identity map, compiled query cache lookup). With 7 requests per k6 iteration and ~50 concurrent VUs, this means hundreds of context allocations per second, all eventually promoted to Gen2. `AddDbContextPool` maintains a pool of reused `CatalogContext` instances, resetting their state between uses rather than allocating/disposing. This eliminates a major allocation source, reducing GC pressure on Gen2 and improving tail latency under load.

## Proposed Fixes

1. **Replace AddDbContext with AddDbContextPool:** At `Dependencies.cs:32`, change `services.AddDbContext<CatalogContext>(...)` to `services.AddDbContextPool<CatalogContext>(...)`. This is a drop-in replacement since `CatalogContext` only depends on `DbContextOptions`. The in-memory path (line 21) can remain as-is since pooling isn't supported for in-memory providers.

## Expected Impact

- Gen2 GC collections should drop significantly (potentially 50-80% reduction)
- p95 latency: reduction of ~0.1-0.3ms from reduced GC pauses and allocation overhead
- RPS: modest improvement from lower per-request overhead
- ~71% of traffic uses CatalogContext, so this has broad reach

