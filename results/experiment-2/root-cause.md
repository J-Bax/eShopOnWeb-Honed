# Root Cause Analysis — Experiment 2

> Generated: 2026-03-31 01:08:39 | Classification: narrow — The redundant second DB write (UpdateAsync after AddAsync) can be eliminated by setting the picture URI before the AddAsync call, all within the single HandleAsync method in this one file.

| Metric | Current | Baseline |
|--------|---------|----------|
| p95 Latency | 2.2712ms | 1013.880795ms |
| Requests/sec | 342.4 | 114.9 |
| Error Rate | 0% | 0% |

---
# Eliminate redundant second DB write when creating catalog items

> **File:** `src/PublicApi/CatalogItemEndpoints/CreateCatalogItemEndpoint.cs` | **Scope:** narrow

## Evidence

At `CreateCatalogItemEndpoint.cs:50-60`, after inserting a new item, the code immediately updates it:

```csharp
newItem = await itemRepository.AddAsync(newItem);        // line 51 — INSERT

if (newItem.Id != 0)
{
    newItem.UpdatePictureUri("eCatalog-item-default.png");
    await itemRepository.UpdateAsync(newItem);             // line 60 — UPDATE
}
```

This performs two sequential DB round-trips (INSERT then UPDATE) for every create request.

## Theory

The default picture URI is known at creation time and could be set on the entity before the initial `AddAsync` call. The second `UpdateAsync` is unnecessary overhead — it doubles the DB write cost for every POST to `/api/catalog-items`. Under load (14.3% of traffic), this adds latency and increases DB contention with concurrent writes.

## Proposed Fixes

1. **Set the default picture URI before insertion:** Call `UpdatePictureUri("eCatalog-item-default.png")` on `newItem` before `AddAsync`, or pass the default URI in the `CatalogItem` constructor at line 50. Then remove the `if` block and the `UpdateAsync` call (lines 53-61).

## Expected Impact

- **Per-request latency reduction:** ~5-15ms (one fewer DB round-trip).
- **p95 latency:** Minor improvement since the Task.Delay dominates, but after fix #1 is applied this becomes more relevant.
- **DB contention:** Reduced write load by ~50% on create path.

