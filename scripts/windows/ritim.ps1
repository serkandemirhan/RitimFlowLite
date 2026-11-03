[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Diagnostics', 'Install', 'StartApi', 'StartWeb', 'TestDomain', 'TestUnit', 'TestDatabase', 'TestNativeDatabase', 'TestBrowser', 'Health')]
    [string]$Action
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
. (Join-Path $PSScriptRoot 'local-config.ps1')
$portableNode = Join-Path $env:LOCALAPPDATA 'RitimFlowLite/tools/node-v22.20.0-win-x64'
if (Test-Path -LiteralPath (Join-Path $portableNode 'node.exe')) {
    $env:PATH = $portableNode + ';' + $env:PATH
}

function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" }
}

Push-Location $projectRoot
try {
    if ($Action -eq 'Diagnostics') {
        Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version | Format-List | Out-Host
        Invoke-Checked 'node' @('--version')
        Invoke-Checked 'npm.cmd' @('--version')
        Invoke-Checked 'git' @('--version')
        Get-Service -Name '*postgres*' -ErrorAction SilentlyContinue | Select-Object Name, Status | Format-Table -AutoSize | Out-Host
        $pgBin = Join-Path $env:ProgramFiles 'PostgreSQL/18/bin'
        foreach ($tool in @('psql', 'pg_dump', 'pg_restore')) {
            $exe = Join-Path $pgBin ($tool + '.exe')
            if (Test-Path -LiteralPath $exe) { Invoke-Checked $exe @('--version') }
        }
        Write-Output 'Configuration presence only (no secret values):'
        foreach ($name in @('DATABASE_URL', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'TEST_DATABASE_URL', 'OIDC_ISSUER', 'OIDC_AUDIENCE', 'OIDC_JWKS_URL')) {
            Write-Output ($name + ': configured=' + [bool][Environment]::GetEnvironmentVariable($name))
        }
        return
    }

    $nodeMajor = & node -p 'process.versions.node.slice(0,2)'
    if ($LASTEXITCODE -ne 0 -or $nodeMajor -ne '22') {
        throw 'Use Node 22 as required by the existing project. No system-wide runtime changes are made by this script.'
    }

    switch ($Action) {
        'Install' {
            $npmVersion = & npm.cmd --version
            if ($LASTEXITCODE -ne 0 -or $npmVersion -notmatch '^10\.') { throw 'npm 10 is required.' }
            Invoke-Checked 'npm.cmd' @('ci', '--ignore-scripts', '--no-audit', '--no-fund')
            Invoke-Checked 'npm.cmd' @('--prefix', 'backend', 'ci', '--ignore-scripts', '--no-audit', '--no-fund')
        }
        'StartApi' {
            $localConfig = Get-RitimDatabaseConfigPath $projectRoot
            if (Test-Path -LiteralPath $localConfig) {
                if ($env:DATABASE_URL -or $env:PGDATABASE) { throw 'Both saved and process database settings are present. Choose one explicitly to avoid the wrong target.' }
                $config = Import-Clixml -LiteralPath $localConfig
                if ($config.Version -ne 1 -or -not $config.Initialized) { throw 'Local database initialization is incomplete.' }
                Set-RitimRuntimeEnvironment $config
            }
            if (-not $env:DATABASE_URL -and -not $env:PGDATABASE) {
                throw 'Configure a dedicated development database securely in this process before starting the API.'
            }
            # Do not enable isolated-development domain mutations or invent OIDC settings here.
            Invoke-Checked 'node' @('backend/src/server.js')
        }
        'StartWeb' { Invoke-Checked 'node' @('integration/dev-server.cjs') }
        'TestDomain' { Invoke-Checked 'node' @('scripts/run-domain.cjs') }
        'TestUnit' { Invoke-Checked 'npm.cmd' @('--prefix', 'backend', 'run', 'test:unit') }
        'TestNativeDatabase' { Invoke-Checked 'node' @('scripts/windows/test-native-postgres.cjs') }
        'TestDatabase' {
            if (-not $env:TEST_DATABASE_URL -or $env:RITIM_CONFIRM_DISPOSABLE_TEST_DATABASE -ne 'YES') {
                throw 'Set TEST_DATABASE_URL securely and RITIM_CONFIRM_DISPOSABLE_TEST_DATABASE=YES only after confirming a dedicated disposable database. Suites create/drop schemas and roles.'
            }
            Invoke-Checked 'npm.cmd' @('--prefix', 'backend', 'run', 'test:integration')
        }
        'TestBrowser' { Invoke-Checked 'node' @('scripts/run-browser.cjs') }
        'Health' {
            foreach ($endpoint in @('http://127.0.0.1:3000/health/live', 'http://127.0.0.1:3000/health/ready')) {
                $response = Invoke-WebRequest -UseBasicParsing -Uri $endpoint -TimeoutSec 10
                [pscustomobject]@{ Endpoint = $endpoint; Status = $response.StatusCode }
            }
            $web = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4178/?mode=api' -TimeoutSec 10
            [pscustomobject]@{ Endpoint = 'Premium development frontend'; Status = $web.StatusCode }
        }
    }
} finally {
    Pop-Location
}
