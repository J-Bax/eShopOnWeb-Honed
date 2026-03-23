# Root Cause Analysis — Experiment 1

> Generated: 2026-03-22 18:43:49 | Classification: narrow — Classification skipped (SkipClassification = $true)

| Metric | Current | Baseline |
|--------|---------|----------|
| p95 Latency | 1020.16585ms | 1020.16585ms |
| Requests/sec | 32.4 | 32.4 |
| Error Rate | 0% | 0% |

---
# DbContext created per-request instead of pooled under high concurrency

> **File:** `SampleApi/Program.cs` | **Scope:** narrow

## Evidence

At `Program.cs:15-16`, the DbContext is registered with `AddDbContext`:

```csharp
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));
```

This creates a new `AppDbContext` instance for every HTTP request via DI. Under the baseline scenario's peak of 500 VUs making 18 requests each with no think-time, this means thousands of DbContext allocations and disposals per second.

## Theory

While `AddDbContext` is fine for moderate load, under 500-VU stress:

1. **Allocation overhead**: Each new DbContext allocates internal tracking structures, change tracker, and configures the SQL connection. Under extreme concurrency, this adds ~0.5-1ms per request of pure overhead.

2. **GC pressure**: Thousands of short-lived DbContext instances per second create Gen0/Gen1 GC pressure. GC pauses can add latency spikes, especially when combined with the large object allocations from 1000-row result sets.

3. **Connection management**: `AddDbContextPool` reuses DbContext instances AND their underlying connections more efficiently, reducing the overhead of connection open/close cycles against the SQL Server connection pool.

This is a secondary contributor — the primary bottleneck is unbounded queries — but it becomes meaningful once the query-level fixes reduce connection hold times.

## Proposed Fixes

1. **Switch to AddDbContextPool**: Replace `AddDbContext<AppDbContext>` with `AddDbContextPool<AppDbContext>` at `Program.cs:15`. Optionally set pool size: `.AddDbContextPool<AppDbContext>(options => ..., poolSize: 256)`. This reuses DbContext instances across requests, eliminating per-request allocation.

## Expected Impact

- p95 latency: Modest per-request improvement (~1-2ms) but reduces GC-induced latency spikes under high concurrency.
- RPS: 5-10% throughput improvement from reduced allocation overhead.
- This fix has the best effort-to-impact ratio: a single-line change that benefits ALL 18 endpoints in the k6 scenario.

