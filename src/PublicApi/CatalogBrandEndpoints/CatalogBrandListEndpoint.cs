using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using AutoMapper;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.eShopWeb.ApplicationCore.Entities;
using Microsoft.eShopWeb.ApplicationCore.Interfaces;
using Microsoft.Extensions.Caching.Memory;
using MinimalApi.Endpoint;

namespace Microsoft.eShopWeb.PublicApi.CatalogBrandEndpoints;

/// <summary>
/// List Catalog Brands
/// </summary>
public class CatalogBrandListEndpoint : IEndpoint<IResult, IRepository<CatalogBrand>>
{
    private const string CacheKey = "catalog-brands";
    private static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(30);

    private readonly IMapper _mapper;
    private readonly IMemoryCache _cache;

    public CatalogBrandListEndpoint(IMapper mapper, IMemoryCache cache)
    {
        _mapper = mapper;
        _cache = cache;
    }

    public void AddRoute(IEndpointRouteBuilder app)
    {
        app.MapGet("api/catalog-brands",
            async (IRepository<CatalogBrand> catalogBrandRepository) =>
            {
                return await HandleAsync(catalogBrandRepository);
            })
           .Produces<ListCatalogBrandsResponse>()
           .WithTags("CatalogBrandEndpoints");
    }

    public async Task<IResult> HandleAsync(IRepository<CatalogBrand> catalogBrandRepository)
    {
        var response = new ListCatalogBrandsResponse();

        if (!_cache.TryGetValue(CacheKey, out List<CatalogBrandDto>? cachedBrands) || cachedBrands == null)
        {
            var items = await catalogBrandRepository.ListAsync();
            cachedBrands = items.Select(_mapper.Map<CatalogBrandDto>).ToList();
            _cache.Set(CacheKey, cachedBrands, CacheTtl);
        }

        response.CatalogBrands.AddRange(cachedBrands);

        return Results.Ok(response);
    }
}