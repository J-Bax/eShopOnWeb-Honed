<#
.SYNOPSIS
    Resets the catalog database before a baseline or experiment starts.

.DESCRIPTION
    Drops CatalogDb so that the next API startup recreates it from scratch
    with fresh seed data.
    This is Hone's pre-experiment reset step. Per-measured-run setup and
    cleanup happen inside the k6 scenarios through their setup()/teardown()
    hooks plus the target's /diag/k6 endpoints.

.PARAMETER TargetPath
    Root directory of the target project (the eShopOnWeb checkout).

.PARAMETER Config
    Parsed Hone target config hashtable when the caller provides one.

.PARAMETER BaseUrl
    The base URL where the API will be started (unused by this hook).

.PARAMETER Experiment
    Current experiment number for logging.
#>
[CmdletBinding()]
param(
    [string]$TargetPath,

    [hashtable]$Config,

    [string]$BaseUrl,
    [int]$Experiment = 0
)

# When invoked by the C# harness, CWD is the target root and no params are passed.
# Default TargetPath to the target root (two levels up from .hone\hooks\).
if (-not $TargetPath) {
    $TargetPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$droppedDbs = @()

try {
    # -- Locate appsettings.json -------------------------------------------------
    $projectPath = if ($Config.Api -and $Config.Api.ProjectPath) {
        $Config.Api.ProjectPath
    } else {
        'src\PublicApi'
    }
    $appSettingsPath = Join-Path -Path $TargetPath -ChildPath $projectPath 'appsettings.json'

    if (-not (Test-Path $appSettingsPath)) {
        $stopwatch.Stop()
        return [PSCustomObject]@{
            Success = $false
            Message = "appsettings.json not found at: $appSettingsPath"
            Duration = $stopwatch.Elapsed
            Artifacts = @()
        }
    }

    # -- Verify sqlcmd is available -----------------------------------------------
    $sqlcmdPath = Get-Command sqlcmd -ErrorAction SilentlyContinue
    if (-not $sqlcmdPath) {
        $stopwatch.Stop()
        return [PSCustomObject]@{
            Success = $false
            Message = 'sqlcmd not found in PATH. Install SQL Server command-line tools.'
            Duration = $stopwatch.Elapsed
            Artifacts = @()
        }
    }

    # -- Parse connection strings --------------------------------------------------
    $appSettings = Get-Content $appSettingsPath -Raw | ConvertFrom-Json
    # Only reset CatalogDb. Identity keeps the stable admin/demo users used by
    # the k6 scenarios, and per-run catalog cleanup is handled through the
    # target-side diagnostics endpoints instead of dropping Identity.
    $connectionNames = @('CatalogConnection')

    foreach ($connName in $connectionNames) {
        $connStr = $appSettings.ConnectionStrings.$connName
        if (-not $connStr) {
            Write-Verbose "No connection string '$connName' found -- skipping"
            continue
        }

        $serverMatch = [regex]::Match($connStr, 'Server=([^;]+)')
        $dbMatch = [regex]::Match($connStr, 'Initial Catalog=([^;]+)')

        if (-not $serverMatch.Success -or -not $dbMatch.Success) {
            Write-Verbose "Could not parse server/database from '$connName' -- skipping"
            continue
        }

        $server = $serverMatch.Groups[1].Value
        $dbName = $dbMatch.Groups[1].Value

        # Escape closing brackets to prevent SQL injection
        $dbName = $dbName.Replace(']', ']]')

        # -- Drop the database via sqlcmd ------------------------------------------
        $dropQuery = @"
IF DB_ID('$($dbName -replace "'", "''")') IS NOT NULL
BEGIN
    ALTER DATABASE [$dbName] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [$dbName];
END
"@

        $output = & sqlcmd -S $server -Q $dropQuery -b 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Verbose "sqlcmd exited $LASTEXITCODE for '$dbName' (may not have existed): $output"
        } else {
            $droppedDbs += $dbName
        }
    }

    $stopwatch.Stop()
    $msg = if ($droppedDbs.Count -gt 0) {
        "Dropped databases: $($droppedDbs -join ', ')"
    } else {
        'No databases to drop (first run or already clean)'
    }

    [PSCustomObject]@{
        Success = $true
        Message = $msg
        Duration = $stopwatch.Elapsed
        Artifacts = @()
    }
} catch {
    $stopwatch.Stop()
    [PSCustomObject]@{
        Success = $false
        Message = "Prepare hook failed: $_"
        Duration = $stopwatch.Elapsed
        Artifacts = @()
    }
}
