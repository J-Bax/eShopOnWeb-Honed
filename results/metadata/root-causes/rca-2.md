# Eliminate redundant second DB write in create endpoint

> **File:** `src/PublicApi/CatalogItemEndpoints/CreateCatalogItemEndpoint.cs` | **Scope:** narrow

## Evidence

At `CreateCatalogItemEndpoint.cs:50-60`, the create handler performs two sequential database writes:

```csharp
newItem = await itemRepository.AddAsync(newItem);       // Line 51 — INSERT

if (newItem.Id != 0)
{
    newItem.UpdatePictureUri("eCatalog-item-default.png"); // Line 59
    await itemRepository.UpdateAsync(newItem);              // Line 60 — UPDATE
}
```

The default picture URI is always set (the condition `newItem.Id != 0` is always true after a successful insert). This results in two DB round trips for every create request.

## Theory

Each DB round trip adds latency (typically 5-15ms for a local/SQLite database, more for networked databases). By setting the picture URI on the entity *before* the initial `AddAsync` call, the INSERT will contain the correct value, eliminating the need for the subsequent UPDATE. Under load, this doubles the write pressure on the database for create operations.

## Proposed Fixes

1. **Set picture URI before AddAsync:** Move `newItem.UpdatePictureUri("eCatalog-item-default.png")` to before line 51 (before `AddAsync`), and remove lines 53-61 (the `if` block with `UpdateAsync`). This consolidates the two DB operations into one INSERT.

## Expected Impact

- **p95 latency:** After the Task.Delay fix, per-request latency for creates should drop by ~5-15ms (one fewer DB round trip).
- **RPS:** Minor improvement from reduced DB contention.
- **Overall p95 improvement:** ~1-3% improvement (modest since it only affects create requests at 14.3% of traffic).
