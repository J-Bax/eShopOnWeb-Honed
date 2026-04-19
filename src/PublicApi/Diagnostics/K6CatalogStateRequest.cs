namespace Microsoft.eShopWeb.PublicApi.Diagnostics;

public class K6CatalogStateRequest : BaseRequest
{
    public string RunId { get; set; } = string.Empty;

    public bool TryNormalizeRunId(out string normalizedRunId)
    {
        normalizedRunId = (RunId ?? string.Empty).Trim();
        RunId = normalizedRunId;
        return normalizedRunId.Length > 0 && normalizedRunId.Length <= 80;
    }

    public string RunTag()
    {
        return K6RunTag.Build(RunId);
    }
}
