using System.Linq;
using System.Threading.Tasks;
using AutoMapper;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.eShopWeb.ApplicationCore.Entities;
using Microsoft.eShopWeb.ApplicationCore.Interfaces;
using Microsoft.eShopWeb.ApplicationCore.Specifications;
using MinimalApi.Endpoint;

namespace Microsoft.eShopWeb.PublicApi.CatalogItemEndpoints;

/// <summary>
/// List Catalog Items (paged)
/// </summary>
public class CatalogItemListPagedEndpoint : IEndpoint<IResult, ListPagedCatalogItemRequest, IRepository<CatalogItem>>
{
    private readonly IUriComposer _uriComposer;
    private readonly IMapper _mapper;

    public CatalogItemListPagedEndpoint(IUriComposer uriComposer, IMapper mapper)
    {
        _uriComposer = uriComposer;
        _mapper = mapper;
    }

    public void AddRoute(IEndpointRouteBuilder app)
    {
        app.MapGet("api/catalog-items",
            async (int? pageSize, int? pageIndex, int? catalogBrandId, int? catalogTypeId, IRepository<CatalogItem> itemRepository) =>
            {
                return await HandleAsync(new ListPagedCatalogItemRequest(pageSize, pageIndex, catalogBrandId, catalogTypeId), itemRepository);
            })
            .Produces<ListPagedCatalogItemResponse>()
            .WithTags("CatalogItemEndpoints");
    }

    public async Task<IResult> HandleAsync(ListPagedCatalogItemRequest request, IRepository<CatalogItem> itemRepository)
    {
        var response = new ListPagedCatalogItemResponse(request.CorrelationId());

        // Fetch one extra item to detect whether a next page exists, avoiding a separate COUNT query.
        var pagedSpec = new CatalogFilterPaginatedSpecification(
            skip: request.PageIndex * request.PageSize,
            take: request.PageSize > 0 ? request.PageSize + 1 : 0,
            brandId: request.CatalogBrandId,
            typeId: request.CatalogTypeId);

        var items = await itemRepository.ListAsync(pagedSpec);

        bool hasNextPage = request.PageSize > 0 && items.Count > request.PageSize;
        var pageItems = hasNextPage ? items.Take(request.PageSize) : items;

        response.CatalogItems.AddRange(pageItems.Select(_mapper.Map<CatalogItemDto>));
        foreach (CatalogItemDto item in response.CatalogItems)
        {
            item.PictureUri = _uriComposer.ComposePicUri(item.PictureUri);
        }

        if (request.PageSize > 0)
        {
            response.PageCount = hasNextPage ? request.PageIndex + 2 : request.PageIndex + 1;
        }
        else
        {
            response.PageCount = items.Count > 0 ? 1 : 0;
        }

        return Results.Ok(response);
    }
}