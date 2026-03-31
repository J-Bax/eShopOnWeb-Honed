<#
.SYNOPSIS
    Resets both eShopOnWeb databases to ensure clean state between experiments.

.DESCRIPTION
    Drops the CatalogDb and Identity databases so that the next API startup
    recreates them from scratch with fresh seed data.
    This ensures every experiment starts with identical data for fair
    performance comparisons.

.PARAMETER TargetPath
    Root directory of the target project (the eShopOnWeb checkout).

.PARAMETER Config
    Parsed .hone/config.psd1 hashtable.

.PARAMETER BaseUrl
    The base URL where the API will be started (unused by this hook).

.PARAMETER Experiment
    Current experiment number for logging.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$TargetPath,

    [Parameter(Mandatory)]
    [hashtable]$Config,

    [string]$BaseUrl,
    [int]$Experiment = 0
)

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
    # Only reset CatalogDb — Identity DB has static seed data (admin + demo
    # users) and doesn't accumulate test data between runs. Dropping it would
    # invalidate JWT tokens held by running k6 VUs.
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
