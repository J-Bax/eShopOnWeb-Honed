using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.eShopWeb;
using Microsoft.eShopWeb.PublicApi.CatalogItemEndpoints;
using Microsoft.eShopWeb.PublicApi.Diagnostics;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace PublicApiIntegrationTests.Diagnostics;

[TestClass]
public class K6CatalogStateEndpointTest
{
    [TestMethod]
    public async Task PrepareRemovesRunTaggedItemsAndRestoresSeededCatalogItems()
    {
        await AssertDiagnosticEndpointRestoresCatalogStateAsync("diag/k6/prepare", "prepare");
    }

    [TestMethod]
    public async Task CleanupRemovesRunTaggedItemsAndRestoresSeededCatalogItems()
    {
        await AssertDiagnosticEndpointRestoresCatalogStateAsync("diag/k6/cleanup", "cleanup");
    }

    [TestMethod]
    public async Task PrepareRejectsBlankRunId()
    {
        var response = await ProgramTest.NewClient.PostAsync(
            "diag/k6/prepare",
            JsonContent(new K6CatalogStateRequest { RunId = " " }));

        Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private static async Task AssertDiagnosticEndpointRestoresCatalogStateAsync(string endpointPath, string expectedOperation)
    {
        var runId = $"integration-{Guid.NewGuid():N}";

        await CallDiagnosticAsync("diag/k6/prepare", runId);

        var createdCatalogItemId = await CreateRunTaggedCatalogItemAsync(runId);
        await MutateSeededCatalogItemAsync(runId);

        var diagnosticResponse = await CallDiagnosticAsync(endpointPath, runId);

        Assert.AreEqual(expectedOperation, diagnosticResponse.Operation);
        Assert.AreEqual(runId, diagnosticResponse.RunId);
        Assert.IsTrue(diagnosticResponse.RemovedRunTaggedCatalogItemCount >= 1);
        Assert.IsTrue(diagnosticResponse.RestoredSeededCatalogItemCount >= 1 || diagnosticResponse.RecreatedSeededCatalogItemCount >= 1);
        CollectionAssert.Contains(diagnosticResponse.SeededCatalogItemIds, 1);
        CollectionAssert.Contains(diagnosticResponse.CatalogBrandIds, 1);
        CollectionAssert.Contains(diagnosticResponse.CatalogTypeIds, 1);

        var deletedCatalogItemResponse = await ProgramTest.NewClient.GetAsync($"api/catalog-items/{createdCatalogItemId}");
        Assert.AreEqual(HttpStatusCode.NotFound, deletedCatalogItemResponse.StatusCode);

        var seededCatalogItemResponse = await ProgramTest.NewClient.GetAsync("api/catalog-items/1");
        seededCatalogItemResponse.EnsureSuccessStatusCode();
        var seededCatalogItem = (await seededCatalogItemResponse.Content.ReadAsStringAsync()).FromJson<GetByIdCatalogItemResponse>();

        Assert.IsNotNull(seededCatalogItem);
        Assert.AreEqual(".NET Bot Black Sweatshirt", seededCatalogItem!.CatalogItem.Name);
        Assert.AreEqual(".NET Bot Black Sweatshirt", seededCatalogItem.CatalogItem.Description);
        Assert.AreEqual(19.5m, seededCatalogItem.CatalogItem.Price);
        Assert.AreEqual(2, seededCatalogItem.CatalogItem.CatalogBrandId);
        Assert.AreEqual(2, seededCatalogItem.CatalogItem.CatalogTypeId);
    }

    private static async Task<int> CreateRunTaggedCatalogItemAsync(string runId)
    {
        var client = NewAdminClient();
        var runTag = K6RunTag.Build(runId);
        var response = await client.PostAsync(
            "api/catalog-items",
            JsonContent(new CreateCatalogItemRequest
            {
                CatalogBrandId = 1,
                CatalogTypeId = 1,
                Description = $"integration create {runTag}",
                Name = $"{runTag} integration create {Guid.NewGuid():N}",
                Price = 42.42m
            }));

        response.EnsureSuccessStatusCode();
        var createCatalogItemResponse = (await response.Content.ReadAsStringAsync()).FromJson<CreateCatalogItemResponse>();

        Assert.IsNotNull(createCatalogItemResponse);
        return createCatalogItemResponse!.CatalogItem.Id;
    }

    private static async Task MutateSeededCatalogItemAsync(string runId)
    {
        var client = NewAdminClient();
        var runTag = K6RunTag.Build(runId);
        var response = await client.PutAsync(
            "api/catalog-items",
            JsonContent(new UpdateCatalogItemRequest
            {
                Id = 1,
                CatalogBrandId = 1,
                CatalogTypeId = 1,
                Description = $"integration mutated {runTag}",
                Name = $"integration mutated {runTag}",
                Price = 77.77m
            }));

        response.EnsureSuccessStatusCode();
    }

    private static async Task<K6CatalogStateResponse> CallDiagnosticAsync(string endpointPath, string runId)
    {
        var response = await ProgramTest.NewClient.PostAsync(
            endpointPath,
            JsonContent(new K6CatalogStateRequest { RunId = runId }));

        response.EnsureSuccessStatusCode();
        var diagnosticResponse = (await response.Content.ReadAsStringAsync()).FromJson<K6CatalogStateResponse>();

        Assert.IsNotNull(diagnosticResponse);
        return diagnosticResponse!;
    }

    private static HttpClient NewAdminClient()
    {
        var client = ProgramTest.NewClient;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", ApiTokenHelper.GetAdminUserToken());
        return client;
    }

    private static StringContent JsonContent<T>(T value)
    {
        return new StringContent(JsonSerializer.Serialize(value), Encoding.UTF8, "application/json");
    }
}
