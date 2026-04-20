# Eliminate redundant second DB round-trip in catalog item creation

> **File:** `src/PublicApi/CatalogItemEndpoints/CreateCatalogItemEndpoint.cs` | **Scope:** narrow

## Evidence

At `CreateCatalogItemEndpoint.cs:50-61`, the create flow performs two sequential database writes:

```csharp
newItem = await itemRepository.AddAsync(newItem);        // line 51 – INSERT

if (newItem.Id != 0)
{
    newItem.UpdatePictureUri("eCatalog-item-default.png"); // line 59
    await itemRepository.UpdateAsync(newItem);              // line 60 – UPDATE
}
```

The item is first inserted, then immediately updated to set a default picture URI. This is two round-trips to the database for every create request.

## Theory

Every POST to `/api/catalog-items` issues an INSERT followed by an UPDATE, doubling the write load on the database. Under concurrent load (up to 12 VUs), this doubles lock contention on the Catalog table and doubles the latency of the create path. Since create is ~10% of all requests and is a prerequisite for the subsequent GET, PUT, and DELETE operations in the test scenario, any slowdown or failure here cascades: if a create times out or deadlocks, the dependent update/delete checks also fail, contributing to the 16.65% error rate.

## Proposed Fixes

1. **Set picture URI before insert:** Call `UpdatePictureUri("eCatalog-item-default.png")` on the `newItem` object *before* calling `AddAsync`, then remove the conditional `UpdateAsync` block entirely. This reduces two DB calls to one. The change is at lines 50-61 of `CreateCatalogItemEndpoint.cs`.

## Expected Impact

- p95 latency: ~3-5ms reduction on create requests by eliminating one DB round-trip
- Error rate: Reduced lock contention should lower timeout/deadlock-driven errors
- Overall p95 improvement: ~3-5% considering create is ~10% of traffic but cascading failures affect ~30% of downstream requests