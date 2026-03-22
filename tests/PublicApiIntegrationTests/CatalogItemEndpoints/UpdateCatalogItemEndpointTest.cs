using Microsoft.eShopWeb;
using Microsoft.eShopWeb.PublicApi.CatalogItemEndpoints;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace PublicApiIntegrationTests.CatalogItemEndpoints;

[TestClass]
public class UpdateCatalogItemEndpointTest
{
    [TestMethod]
    public async Task ReturnsSuccessGivenValidUpdateAndAdminUserToken()
    {
        var adminToken = ApiTokenHelper.GetAdminUserToken();
        var client = ProgramTest.NewClient;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);

        var request = new UpdateCatalogItemRequest()
        {
            Id = 1,
            CatalogBrandId = 2,
            CatalogTypeId = 2,
            Description = "Updated description",
            Name = ".NET Bot Black Sweatshirt",
            Price = 25.00m
        };
        var jsonContent = new StringContent(JsonSerializer.Serialize(request), Encoding.UTF8, "application/json");
        var response = await client.PutAsync("api/catalog-items", jsonContent);
        response.EnsureSuccessStatusCode();
        var stringResponse = await response.Content.ReadAsStringAsync();
        var model = stringResponse.FromJson<UpdateCatalogItemResponse>();

        Assert.AreEqual(1, model!.CatalogItem.Id);
        Assert.AreEqual(25.00m, model.CatalogItem.Price);
        Assert.AreEqual("Updated description", model.CatalogItem.Description);
    }

    [TestMethod]
    public async Task ReturnsNotFoundGivenInvalidIdAndAdminUserToken()
    {
        var adminToken = ApiTokenHelper.GetAdminUserToken();
        var client = ProgramTest.NewClient;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);

        var request = new UpdateCatalogItemRequest()
        {
            Id = 99999,
            CatalogBrandId = 1,
            CatalogTypeId = 1,
            Description = "test",
            Name = "test",
            Price = 1.00m
        };
        var jsonContent = new StringContent(JsonSerializer.Serialize(request), Encoding.UTF8, "application/json");
        var response = await client.PutAsync("api/catalog-items", jsonContent);

        Assert.AreEqual(HttpStatusCode.NotFound, response.StatusCode);
    }
}
