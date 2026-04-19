using System;

namespace Microsoft.eShopWeb.PublicApi.Diagnostics;

public class K6CatalogStateResponse : BaseResponse
{
    public K6CatalogStateResponse(Guid correlationId) : base(correlationId)
    {
    }

    public K6CatalogStateResponse()
    {
    }

    public string Operation { get; set; } = string.Empty;
    public string RunId { get; set; } = string.Empty;
    public int RemovedRunTaggedCatalogItemCount { get; set; }
    public int RestoredSeededCatalogItemCount { get; set; }
    public int RecreatedSeededCatalogItemCount { get; set; }
    public int[] SeededCatalogItemIds { get; set; } = Array.Empty<int>();
    public int[] CatalogBrandIds { get; set; } = Array.Empty<int>();
    public int[] CatalogTypeIds { get; set; } = Array.Empty<int>();
}
