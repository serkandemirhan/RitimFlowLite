$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
. (Join-Path $PSScriptRoot 'local-config.ps1')
$identity = Import-Clixml -LiteralPath (Get-RitimIdentityConfigPath $taskRoot)
$env:RITIM_LOCAL_PFX = $identity.PfxPath
$env:RITIM_LOCAL_PFX_PASSWORD = Get-RitimSecretText $identity.PfxPassword
try { & node (Join-Path $PSScriptRoot 'start-local-cloud.cjs') }
finally { Remove-Item Env:RITIM_LOCAL_PFX_PASSWORD -ErrorAction SilentlyContinue }
