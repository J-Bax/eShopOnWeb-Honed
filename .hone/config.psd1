@{
    # ── Target Identity ──────────────────────────────────────────
    Name       = 'eShopOnWeb'
    BaseBranch = 'main'

    # ── API Project Layout ───────────────────────────────────────
    Api = @{
        SolutionPath     = 'eShopOnWeb.sln'
        ProjectPath      = 'src\PublicApi'
        TestProjectPath  = 'tests\FunctionalTests'
        ResultsPath      = 'results'
        MetadataPath     = 'results\metadata'
        BaseUrl          = 'http://localhost:0'
        HealthEndpoint   = '/health'
        GcEndpoint       = '/diag/gc'
        StartupTimeout   = 120
        SourceCodePaths  = @(
            'src\PublicApi'
            'src\ApplicationCore'
            'src\Infrastructure'
        )
        SourceFileGlob   = '*.cs'
    }

    # ── Lifecycle Hooks ──────────────────────────────────────────
    # ALL hooks must be declared. Use Type = 'Skip' for phases not needed.
    Hooks = @{
        Prepare  = @{ Type = 'Script'; Path = '.hone\hooks\prepare.ps1' }
        Start    = @{ Type = 'Shared'; Name = 'dotnet-start' }
        Stop     = @{ Type = 'Shared'; Name = 'dotnet-stop' }
        Ready    = @{ Type = 'Shared'; Name = 'health-poll' }
        Warmup   = @{ Type = 'Skip' }
        Active   = @{ Type = 'Shared'; Name = 'k6-run' }
        Cooldown = @{ Type = 'Http'; Method = 'POST'; Path = '/diag/gc' }
        Cleanup  = @{ Type = 'Skip' }
    }

    # ── Scale Test Configuration ─────────────────────────────────
    ScaleTest = @{
        ScenarioPath         = '.hone\scenarios\baseline.js'
        ScenarioRegistryPath = '.hone\scenarios\thresholds.json'
        WarmupEnabled        = $false
        MeasuredRuns         = 5
        CooldownSeconds      = 5
    }

    # ── Runtime Counters ─────────────────────────────────────────
    DotnetCounters = @{
        Enabled                = $true
        Providers              = @(
            'System.Runtime'
            'Microsoft.AspNetCore.Hosting'
            'Microsoft.AspNetCore.Http.Connections'
            'System.Net.Http'
        )
        RefreshIntervalSeconds = 1
    }
}
