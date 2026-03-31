# Eliminate redundant second DB write when creating catalog items

> **File:** `src/PublicApi/CatalogItemEndpoints/CreateCatalogItemEndpoint.cs` | **Scope:** narrow

## Evidence

At `CreateCatalogItemEndpoint.cs:50-60`, the create handler performs two sequential database writes:

```csharp
var newItem = new CatalogItem(request.CatalogTypeId, request.CatalogBrandId, request.Description, request.Name, request.Price, request.PictureUri);
newItem = await itemRepository.AddAsync(newItem);  // DB write #1

if (newItem.Id != 0)
{
    newItem.UpdatePictureUri("eCatalog-item-default.png");
    await itemRepository.UpdateAsync(newItem);       // DB write #2
}
```

The `CatalogItem` constructor at `CatalogItem.cs:18-31` accepts `pictureUri` as a parameter, and `UpdatePictureUri` at line 56-64 simply sets the `PictureUri` property. The default picture URI is known at creation time.

## Theory

Every create request performs two round-trips to the database: an INSERT followed by an immediate UPDATE. Under the k6 load test, create requests represent ~14.3% of traffic. Each unnecessary UPDATE doubles the write cost for this endpoint, increasing latency and contention on the database. With 50 concurrent VUs, this means up to 50 extra DB round-trips per second that serve no purpose.

## Proposed Fixes

1. **Set the picture URI before the initial AddAsync:** Construct the `CatalogItem` with the default picture URI string (built the same way `UpdatePictureUri` builds it), eliminating the need for the subsequent `UpdateAsync` call. Remove lines 53-61.

## Expected Impact

- Per-request latency for create endpoint: reduced by ~5-15ms (one fewer DB round-trip)
- Reduced DB write contention, benefiting all endpoints
- Overall p95 improvement: ~1-2% (modest since this is secondary to the Task.Delay issue)
