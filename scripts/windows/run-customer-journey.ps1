$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'local-config.ps1')
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$identity = Import-Clixml -LiteralPath (Get-RitimIdentityConfigPath $projectRoot)
$database = Import-Clixml -LiteralPath (Get-RitimDatabaseConfigPath $projectRoot)
Set-RitimRuntimeEnvironment $database
$env:RITIM_LOCAL_LOGIN_PASSWORD = Get-RitimSecretText $identity.ManagerPassword
$env:RITIM_LOCAL_TENANT_ID = $identity.TenantId
$env:RITIM_LOCAL_SITE_ID = $identity.SiteId
$env:NODE_EXTRA_CA_CERTS = $identity.PemPath
$env:PATH = (Join-Path $env:LOCALAPPDATA 'RitimFlowLite/tools/node-v22.20.0-win-x64')+';'+$env:PATH
try { & node (Join-Path $PSScriptRoot 'run-customer-journey.cjs'); if ($LASTEXITCODE -ne 0) { throw 'Journey stopped; saved checkpoint will resume completed steps.' } }
finally { Remove-Item Env:RITIM_LOCAL_LOGIN_PASSWORD -ErrorAction SilentlyContinue }
