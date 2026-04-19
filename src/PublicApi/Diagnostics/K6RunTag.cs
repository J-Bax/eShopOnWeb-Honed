namespace Microsoft.eShopWeb.PublicApi.Diagnostics;

public static class K6RunTag
{
    public static string Build(string runId)
    {
        return $"[k6-run:{runId}]";
    }
}
