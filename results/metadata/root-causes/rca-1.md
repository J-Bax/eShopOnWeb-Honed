# Eliminate AutoMapper overhead and inefficient PageCount calculation in list endpoint

> **File:** `src/PublicApi/CatalogItemEndpoints/CatalogItemListPagedEndpoint.cs` | **Scope:** narrow

## Evidence

At `CatalogItemListPagedEndpoint.cs:66`, the endpoint uses AutoMapper to map each entity:

```csharp
response.CatalogItems.AddRange(items.Select(_mapper.Map<CatalogItemDto>));
```

Other endpoints (e.g., `CatalogItemGetByIdEndpoint.cs:42-51`) use direct manual mapping, which avoids AutoMapper's internal reflection and expression compilation overhead.

At `CatalogItemListPagedEndpoint.cs:74`, the PageCount calculation is:

```csharp
response.PageCount = int.Parse(Math.Ceiling((decimal)totalItems / request.PageSize).ToString());
```

This performs decimal division, `Math.Ceiling`, `ToString()` (allocating a string), and `int.Parse` — all unnecessary when simple integer ceiling division `(totalItems + request.PageSize - 1) / request.PageSize` produces the same result with zero allocations.

## Theory

AutoMapper incurs per-call overhead: delegate invocations, internal dictionary lookups, and intermediate object allocations for each mapped item. For a page of 10 items, this is 10× the cost vs. direct property assignment. Combined with the string allocation in PageCount, this adds measurable GC pressure on every catalog list request.

The runtime counters show **5.9M Gen2 collections**, indicating significant GC pressure. Eliminating unnecessary allocations on a hot path (14.3% of traffic) directly reduces GC pauses that inflate p95 latency.

## Proposed Fixes

1. **Replace AutoMapper with manual mapping:** At line 66, replace `items.Select(_mapper.Map<CatalogItemDto>)` with a direct Select that constructs `CatalogItemDto` inline (same pattern as `CatalogItemGetByIdEndpoint.cs:42-51`). This also allows folding the `PictureUri` composition (lines 67-70) into the same Select, eliminating the separate foreach loop.

2. **Replace PageCount with integer arithmetic:** At line 74, replace `int.Parse(Math.Ceiling((decimal)totalItems / request.PageSize).ToString())` with `(totalItems + request.PageSize - 1) / request.PageSize`.

## Expected Impact

- p95 latency: reduction of ~0.05-0.15ms per request due to fewer allocations and no AutoMapper overhead
- GC pressure: measurable reduction in Gen2 collections from eliminating per-request string and AutoMapper allocations
- Overall p95 improvement: ~1-2%
