using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using MinimalApi.Endpoint;

namespace Microsoft.eShopWeb.PublicApi.Diagnostics;

public class K6PrepareEndpoint : IEndpoint<IResult, K6CatalogStateRequest, K6CatalogStateService>
{
    public void AddRoute(IEndpointRouteBuilder app)
    {
        app.MapPost("diag/k6/prepare",
            async (K6CatalogStateRequest request, K6CatalogStateService k6CatalogStateService) =>
            {
                return await HandleAsync(request, k6CatalogStateService);
            })
            .Produces<K6CatalogStateResponse>()
            .WithTags("Diagnostics");
    }

    public async Task<IResult> HandleAsync(K6CatalogStateRequest request, K6CatalogStateService k6CatalogStateService)
    {
        if (!request.TryNormalizeRunId(out _))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(K6CatalogStateRequest.RunId)] = new[] { "RunId is required and must be 80 characters or fewer." }
            });
        }

        var response = await k6CatalogStateService.PrepareAsync(request);
        return Results.Ok(response);
    }
}
