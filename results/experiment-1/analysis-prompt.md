Analyze the **eShopOnWeb** Web API's performance and identify 1-3 optimization opportunities ranked by expected impact. For each, provide a detailed root-cause analysis with evidence (code snippets + line references, not full files), theory, proposed fixes, and expected impact.

## Current Performance (Experiment 1)
- p95 Latency: 1013.98535ms
- Requests/sec: 115.3
- Error rate: 0%
- Improvement vs baseline: 0%

## Baseline Performance
- p95 Latency: 1013.98535ms
- Requests/sec: 115.3
- Error rate: 0%


## Traffic Distribution (k6 Scenario)
The following k6 load test scenario defines the request patterns and relative weights of each
endpoint. Use this to estimate what percentage of total traffic each endpoint/code path receives.

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const ADMIN_USER = 'admin@microsoft.com';
const ADMIN_PASS = 'Pass@word1';

// Deterministic ID generator (same VU + iteration = same IDs across runs)
function seededId(salt, max) {
    return (((__VU * 997 + __ITER * 8191 + salt * 127) * 2654435761) >>> 0) % max + 1;
}

export const options = {
    stages: [
        { duration: '10s', target: 10 },
        { duration: '20s', target: 30 },
        { duration: '20s', target: 50 },
        { duration: '10s', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p(95)<2000'],
        http_req_failed: ['rate<0.05'],
    },
};

// Authenticate once at test start and share token across VUs
export function setup() {
    const authRes = http.post(`${BASE_URL}/api/authenticate`, JSON.stringify({
        username: ADMIN_USER,
        password: ADMIN_PASS,
    }), { headers: { 'Content-Type': 'application/json' } });

    check(authRes, { 'auth 200': (r) => r.status === 200 });
    return { token: JSON.parse(authRes.body).token };
}

export default function (data) {
    const authHeaders = {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${data.token}`,
        },
    };

    // ── Read operations (4 requests) ────────────────────────────────────

    // Browse catalog (paginated — deterministic page)
    const pageIndex = seededId(1, 2) - 1;
    const catalogPage = http.get(
        `${BASE_URL}/api/catalog-items?pageSize=10&pageIndex=${pageIndex}`
    );
    check(catalogPage, {
        'catalog list 200': (r) => r.status === 200,
        'catalog has items': (r) => JSON.parse(r.body).catalogItems.length > 0,
    });

    // Get a specific item (deterministic ID from seed data)
    const itemId = seededId(2, 12);
    const itemResponse = http.get(`${BASE_URL}/api/catalog-items/${itemId}`);
    check(itemResponse, { 'item detail 200': (r) => r.status === 200 });

    // Browse brands
    const brandsResponse = http.get(`${BASE_URL}/api/catalog-brands`);
    check(brandsResponse, { 'brands 200': (r) => r.status === 200 });

    // Browse types
    const typesResponse = http.get(`${BASE_URL}/api/catalog-types`);
    check(typesResponse, { 'types 200': (r) => r.status === 200 });

    // Health check (validates API liveness under load)
    const healthResponse = http.get(`${BASE_URL}/health`);
    check(healthResponse, { 'health 200': (r) => r.status === 200 });

    // ── Write operations (2 requests — DB resets between measured runs) ──

    // Update an existing item (PUT — idempotent)
    const updateId = seededId(3, 12);
    const updatePayload = JSON.stringify({
        id: updateId,
        catalogBrandId: seededId(4, 5),
        catalogTypeId: seededId(5, 4),
        description: `Updated by k6 VU${__VU} iter${__ITER}`,
        name: `.NET Bot Black Sweatshirt`,
        price: 10 + seededId(6, 90),
    });
    const updateRes = http.put(`${BASE_URL}/api/catalog-items`, updatePayload, authHeaders);
    check(updateRes, { 'update 200': (r) => r.status === 200 });

    // Create a new item (POST — safe because DB resets between runs)
    const createName = `k6-item-${__VU}-${__ITER}`;
    const createPayload = JSON.stringify({
        catalogBrandId: seededId(7, 5),
        catalogTypeId: seededId(8, 4),
        description: `Load test item VU${__VU}`,
        name: createName,
        price: 5 + seededId(9, 95),
    });
    const createRes = http.post(`${BASE_URL}/api/catalog-items`, createPayload, authHeaders);
    check(createRes, { 'create 201': (r) => r.status === 201 });

    sleep(0.5);
}

```



## Source Files
The following source files are available for analysis (paths relative to the eShopOnWeb project root).
Read the files that are relevant to identifying performance bottlenecks.

- src/PublicApi/BaseMessage.cs
- src/PublicApi/BaseRequest.cs
- src/PublicApi/BaseResponse.cs
- src/PublicApi/CustomSchemaFilters.cs
- src/PublicApi/ImageValidators.cs
- src/PublicApi/MappingProfile.cs
- src/PublicApi/Program.cs
- src/PublicApi/AuthEndpoints/AuthenticateEndpoint.AuthenticateRequest.cs
- src/PublicApi/AuthEndpoints/AuthenticateEndpoint.AuthenticateResponse.cs
- src/PublicApi/AuthEndpoints/AuthenticateEndpoint.ClaimValue.cs
- src/PublicApi/AuthEndpoints/AuthenticateEndpoint.cs
- src/PublicApi/AuthEndpoints/AuthenticateEndpoint.UserInfo.cs
- src/PublicApi/CatalogBrandEndpoints/CatalogBrandDto.cs
- src/PublicApi/CatalogBrandEndpoints/CatalogBrandListEndpoint.cs
- src/PublicApi/CatalogBrandEndpoints/CatalogBrandListEndpoint.ListCatalogBrandsResponse.cs
- src/PublicApi/CatalogItemEndpoints/CatalogItemDto.cs
- src/PublicApi/CatalogItemEndpoints/CatalogItemGetByIdEndpoint.cs
- src/PublicApi/CatalogItemEndpoints/CatalogItemGetByIdEndpoint.GetByIdCatalogItemRequest.cs
- src/PublicApi/CatalogItemEndpoints/CatalogItemGetByIdEndpoint.GetByIdCatalogItemResponse.cs
- src/PublicApi/CatalogItemEndpoints/CatalogItemListPagedEndpoint.cs
- src/PublicApi/CatalogItemEndpoints/CatalogItemListPagedEndpoint.ListPagedCatalogItemRequest.cs
- src/PublicApi/CatalogItemEndpoints/CatalogItemListPagedEndpoint.ListPagedCatalogItemResponse.cs
- src/PublicApi/CatalogItemEndpoints/CreateCatalogItemEndpoint.CreateCatalogItemRequest.cs
- src/PublicApi/CatalogItemEndpoints/CreateCatalogItemEndpoint.CreateCatalogItemResponse.cs
- src/PublicApi/CatalogItemEndpoints/CreateCatalogItemEndpoint.cs
- src/PublicApi/CatalogItemEndpoints/DeleteCatalogItemEndpoint.cs
- src/PublicApi/CatalogItemEndpoints/DeleteCatalogItemEndpoint.DeleteCatalogItemRequest.cs
- src/PublicApi/CatalogItemEndpoints/DeleteCatalogItemEndpoint.DeleteCatalogItemResponse.cs
- src/PublicApi/CatalogItemEndpoints/UpdateCatalogItemEndpoint.cs
- src/PublicApi/CatalogItemEndpoints/UpdateCatalogItemEndpoint.UpdateCatalogItemRequest.cs
- src/PublicApi/CatalogItemEndpoints/UpdateCatalogItemEndpoint.UpdateCatalogItemResponse.cs
- src/PublicApi/CatalogTypeEndpoints/CatalogTypeDto.cs
- src/PublicApi/CatalogTypeEndpoints/CatalogTypeListEndpoint.cs
- src/PublicApi/CatalogTypeEndpoints/CatalogTypeListEndpoint.ListCatalogTypesResponse.cs
- src/PublicApi/Middleware/ExceptionMiddleware.cs
- src/PublicApi/obj/Release/net8.0/.NETCoreApp,Version=v8.0.AssemblyAttributes.cs
- src/PublicApi/obj/Release/net8.0/PublicApi.AssemblyInfo.cs
- src/PublicApi/obj/Release/net8.0/PublicApi.MvcApplicationPartsAssemblyInfo.cs
- src/ApplicationCore/CatalogSettings.cs
- src/ApplicationCore/Constants/AuthorizationConstants.cs
- src/ApplicationCore/Entities/BaseEntity.cs
- src/ApplicationCore/Entities/CatalogBrand.cs
- src/ApplicationCore/Entities/CatalogItem.cs
- src/ApplicationCore/Entities/CatalogType.cs
- src/ApplicationCore/Entities/BasketAggregate/Basket.cs
- src/ApplicationCore/Entities/BasketAggregate/BasketItem.cs
- src/ApplicationCore/Entities/BuyerAggregate/Buyer.cs
- src/ApplicationCore/Entities/BuyerAggregate/PaymentMethod.cs
- src/ApplicationCore/Entities/OrderAggregate/Address.cs
- src/ApplicationCore/Entities/OrderAggregate/CatalogItemOrdered.cs
- src/ApplicationCore/Entities/OrderAggregate/Order.cs
- src/ApplicationCore/Entities/OrderAggregate/OrderItem.cs
- src/ApplicationCore/Exceptions/BasketNotFoundException.cs
- src/ApplicationCore/Exceptions/DuplicateException.cs
- src/ApplicationCore/Exceptions/EmptyBasketOnCheckoutException.cs
- src/ApplicationCore/Extensions/GuardExtensions.cs
- src/ApplicationCore/Extensions/JsonExtensions.cs
- src/ApplicationCore/Interfaces/IAggregateRoot.cs
- src/ApplicationCore/Interfaces/IAppLogger.cs
- src/ApplicationCore/Interfaces/IBasketQueryService.cs
- src/ApplicationCore/Interfaces/IBasketService.cs
- src/ApplicationCore/Interfaces/IEmailSender.cs
- src/ApplicationCore/Interfaces/IOrderService.cs
- src/ApplicationCore/Interfaces/IReadRepository.cs
- src/ApplicationCore/Interfaces/IRepository.cs
- src/ApplicationCore/Interfaces/ITokenClaimsService.cs
- src/ApplicationCore/Interfaces/IUriComposer.cs
- src/ApplicationCore/obj/Release/net8.0/.NETCoreApp,Version=v8.0.AssemblyAttributes.cs
- src/ApplicationCore/obj/Release/net8.0/ApplicationCore.AssemblyInfo.cs
- src/ApplicationCore/Services/BasketService.cs
- src/ApplicationCore/Services/OrderService.cs
- src/ApplicationCore/Services/UriComposer.cs
- src/ApplicationCore/Specifications/BasketWithItemsSpecification.cs
- src/ApplicationCore/Specifications/CatalogFilterPaginatedSpecification.cs
- src/ApplicationCore/Specifications/CatalogFilterSpecification.cs
- src/ApplicationCore/Specifications/CatalogItemNameSpecification.cs
- src/ApplicationCore/Specifications/CatalogItemsSpecification.cs
- src/ApplicationCore/Specifications/CustomerOrdersSpecification.cs
- src/ApplicationCore/Specifications/CustomerOrdersWithItemsSpecification.cs
- src/ApplicationCore/Specifications/OrderWithItemsByIdSpec.cs
- src/Infrastructure/Dependencies.cs
- src/Infrastructure/Data/CatalogContext.cs
- src/Infrastructure/Data/CatalogContextSeed.cs
- src/Infrastructure/Data/EfRepository.cs
- src/Infrastructure/Data/FileItem.cs
- src/Infrastructure/Data/Config/BasketConfiguration.cs
- src/Infrastructure/Data/Config/BasketItemConfiguration.cs
- src/Infrastructure/Data/Config/CatalogBrandConfiguration.cs
- src/Infrastructure/Data/Config/CatalogItemConfiguration.cs
- src/Infrastructure/Data/Config/CatalogTypeConfiguration.cs
- src/Infrastructure/Data/Config/OrderConfiguration.cs
- src/Infrastructure/Data/Config/OrderItemConfiguration.cs
- src/Infrastructure/Data/Migrations/20201202111507_InitialModel.cs
- src/Infrastructure/Data/Migrations/20201202111507_InitialModel.Designer.cs
- src/Infrastructure/Data/Migrations/20211026175614_FixBuyerId.cs
- src/Infrastructure/Data/Migrations/20211026175614_FixBuyerId.Designer.cs
- src/Infrastructure/Data/Migrations/20211231093753_FixShipToAddress.cs
- src/Infrastructure/Data/Migrations/20211231093753_FixShipToAddress.Designer.cs
- src/Infrastructure/Data/Migrations/CatalogContextModelSnapshot.cs
- src/Infrastructure/Data/Queries/BasketQueryService.cs
- src/Infrastructure/Identity/AppIdentityDbContext.cs
- src/Infrastructure/Identity/AppIdentityDbContextSeed.cs
- src/Infrastructure/Identity/ApplicationUser.cs
- src/Infrastructure/Identity/IdentityTokenClaimService.cs
- src/Infrastructure/Identity/UserNotFoundException.cs
- src/Infrastructure/Identity/Migrations/20201202111612_InitialIdentityModel.cs
- src/Infrastructure/Identity/Migrations/20201202111612_InitialIdentityModel.Designer.cs
- src/Infrastructure/Identity/Migrations/AppIdentityDbContextModelSnapshot.cs
- src/Infrastructure/Logging/LoggerAdapter.cs
- src/Infrastructure/obj/Release/net8.0/.NETCoreApp,Version=v8.0.AssemblyAttributes.cs
- src/Infrastructure/obj/Release/net8.0/Infrastructure.AssemblyInfo.cs
- src/Infrastructure/Services/EmailSender.cs

## Response Format
Respond with JSON only. No markdown, no code blocks around the JSON.

CRITICAL: Each "filePath" value in your response MUST exactly match one of the source file paths listed above.
Do NOT invent paths or use paths from other projects. Example of a valid response:

```
{
  "opportunities": [
    {
      "filePath": "src/PublicApi/BaseMessage.cs",
      "explanation": "...",
      "impact": "..."
    }
  ]
}
```
