Apply this specific optimization to the file and return the complete new file content.

## Target File
src/PublicApi/CatalogItemEndpoints/CreateCatalogItemEndpoint.cs

## Optimization to Apply
Eliminate redundant second DB round-trip in create endpoint

## Root Cause Analysis

# Root Cause Analysis — Experiment 2

> Generated: 2026-03-31 02:12:15 | Classification: narrow — The redundant second DB round-trip (UpdateAsync after AddAsync) can be eliminated by setting the picture URI before calling AddAsync, all within the single HandleAsync method in this one file.

| Metric | Current | Baseline |
|--------|---------|----------|
| p95 Latency | 2.0484ms | 1013.880795ms |
| Requests/sec | 340.8 | 114.9 |
| Error Rate | 0% | 0% |

---
# Eliminate redundant second DB round-trip in create endpoint

> **File:** `src/PublicApi/CatalogItemEndpoints/CreateCatalogItemEndpoint.cs` | **Scope:** narrow

## Evidence

At `CreateCatalogItemEndpoint.cs:50-61`, every new item creation performs two sequential database writes:

```csharp
newItem = await itemRepository.AddAsync(newItem);           // line 51 — INSERT

if (newItem.Id != 0)
{
    newItem.UpdatePictureUri("eCatalog-item-default.png");  // line 59
    await itemRepository.UpdateAsync(newItem);               // line 60 — UPDATE
}
```

The default picture URI could be set **before** the initial `AddAsync`, avoiding the second round-trip entirely.

## Theory

Every POST to `/api/catalog-items` makes two DB round-trips (INSERT then UPDATE) when one would suffice. Under load (the k6 test issues 1 create per iteration = ~14.3% of traffic), this doubles the write latency and increases database contention. The duplicate-name check via `CountAsync` (line 44) adds a third round-trip, but the easiest win is collapsing the INSERT + UPDATE into a single INSERT.

## Proposed Fixes

1. **Set the default picture URI before `AddAsync`:** Move `newItem.UpdatePictureUri("eCatalog-item-default.png")` to right after the `new CatalogItem(...)` constructor call (after line 50), and remove the `if` block and `UpdateAsync` call on lines 53-61.

## Expected Impact

- p95 latency: ~5-15ms reduction per create request (eliminating one DB round-trip).
- RPS: Minor improvement from reduced DB connection time.
- Error rate: No change.




Read the file at the path above (relative to the eShopOnWeb root), apply ONLY the
optimization described, and return the COMPLETE new file in a fenced code block.
No explanation, no commentary — just the code block.
