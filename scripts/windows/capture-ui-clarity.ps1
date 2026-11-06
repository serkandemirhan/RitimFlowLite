param([switch]$CaptureOnly)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'local-config.ps1')
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$identity=Import-Clixml -LiteralPath (Get-RitimIdentityConfigPath $root)
$env:RITIM_LOCAL_LOGIN_PASSWORD=Get-RitimSecretText $identity.ManagerPassword
$env:RITIM_LOCAL_TENANT_ID=$identity.TenantId
$env:RITIM_LOCAL_SITE_ID=$identity.SiteId
$env:NODE_EXTRA_CA_CERTS=$identity.PemPath
$env:PATH=(Join-Path $env:LOCALAPPDATA 'RitimFlowLite/tools/node-v22.20.0-win-x64')+';'+$env:PATH
$env:RITIM_WORKFLOW_CAPTURE_ONLY=if($CaptureOnly){'1'}else{'0'}
try{node (Join-Path $PSScriptRoot 'capture-ui-clarity.cjs');if($LASTEXITCODE){throw 'Workflow verification failed'}}finally{Remove-Item Env:RITIM_LOCAL_LOGIN_PASSWORD -ErrorAction SilentlyContinue;Remove-Item Env:RITIM_WORKFLOW_CAPTURE_ONLY -ErrorAction SilentlyContinue}
