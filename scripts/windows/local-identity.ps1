[CmdletBinding()]
param([Parameter(Mandatory = $true)][ValidateSet('Configure','Start','Api','VerifyOrder')][string]$Action,[switch]$GenerateVerificationPassword)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
. (Join-Path $PSScriptRoot 'local-config.ps1')
$tools = Join-Path $env:LOCALAPPDATA 'RitimFlowLite/tools'
$env:PATH = (Join-Path $tools 'node-v22.20.0-win-x64') + ';' + $env:PATH
$env:JAVA_HOME = Join-Path $tools 'jdk21'
$keycloak = Join-Path $tools 'keycloak-26.4.7'
$identityFile = Get-RitimIdentityConfigPath $projectRoot
$databaseFile = Get-RitimDatabaseConfigPath $projectRoot
if (-not (Test-Path -LiteralPath $databaseFile)) { throw 'Initialize the development database first.' }
$database = Import-Clixml -LiteralPath $databaseFile
if (-not $database.Initialized -or $database.Database -ne 'ritim_local_dev' -or -not $database.IsolatedDevelopment) { throw 'Explicit initialized ritim_local_dev development configuration required.' }

function New-LocalSecret {
    $bytes = New-Object byte[] 32
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    return ConvertTo-SecureString ([Convert]::ToBase64String($bytes)) -AsPlainText -Force
}
function Invoke-LocalNode {
    param([string]$Script)
    & node (Join-Path $projectRoot $Script)
    if ($LASTEXITCODE -ne 0) { throw 'Local development operation failed; existing data was preserved.' }
}

Push-Location $projectRoot
try {
    if ($Action -eq 'Configure' -and -not (Test-Path -LiteralPath $identityFile)) {
        if ($GenerateVerificationPassword) {
            $managerPassword = New-LocalSecret
        } else {
            $credential = Get-Credential -UserName 'manager' -Message 'Ritim: manager kullanicisi icin en az 12 karakterli AYRI test sifresi belirleyin. PostgreSQL sifresi degildir.'
            if (-not $credential -or $credential.GetNetworkCredential().Password.Length -lt 12) { throw 'A local manager test password of at least 12 characters is required.' }
            $managerPassword = $credential.Password
        }
        $identityDirectory = Join-Path (Split-Path -Parent $identityFile) 'identity'
        Protect-RitimConfigDirectory $identityDirectory
        $certificate = New-SelfSignedCertificate -DnsName 'localhost' -CertStoreLocation 'Cert:\CurrentUser\My' -FriendlyName 'RitimFlow local-only development identity (14 days)' -Type SSLServerAuthentication -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -NotAfter (Get-Date).AddDays(14)
        $pfxPassword = New-LocalSecret
        $pfx = Join-Path $identityDirectory 'localhost.pfx'
        Export-PfxCertificate -Cert $certificate -FilePath $pfx -Password $pfxPassword | Out-Null
        $cer = Join-Path $identityDirectory 'localhost.cer'
        Export-Certificate -Cert $certificate -FilePath $cer | Out-Null
        Import-Certificate -FilePath $cer -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null
        $pem = Join-Path $identityDirectory 'localhost.pem'
        $base64 = [Convert]::ToBase64String($certificate.RawData,[Base64FormattingOptions]::InsertLineBreaks)
        [IO.File]::WriteAllText($pem,"-----BEGIN CERTIFICATE-----`r`n" + $base64 + "`r`n-----END CERTIFICATE-----`r`n")
        $identity = [pscustomobject]@{
            Version=1; Database=$database.Database; Home=$identityDirectory; CertificateThumbprint=$certificate.Thumbprint
            PfxPath=$pfx; PemPath=$pem; PfxPassword=$pfxPassword; ManagerPassword=$managerPassword
            AdminPassword=(New-LocalSecret); RecoveryKey=(New-LocalSecret)
            TenantId=[guid]::NewGuid().ToString(); SiteId=[guid]::NewGuid().ToString()
            Issuer='https://localhost:44739/realms/ritim-dev'; AppOrigin='http://127.0.0.1:4178'
        }
        $identity | Export-Clixml -LiteralPath $identityFile
    }
    if (-not (Test-Path -LiteralPath $identityFile)) { throw 'Run Configure first.' }
    $identity = Import-Clixml -LiteralPath $identityFile
    if ($identity.Version -ne 1 -or $identity.Database -ne $database.Database) { throw 'Local identity configuration mismatch.' }
    if (-not (Test-Path -LiteralPath ('Cert:\CurrentUser\Root\' + $identity.CertificateThumbprint))) { throw 'The matching local TLS certificate must be trusted; TLS verification is not bypassed.' }
    $env:NODE_EXTRA_CA_CERTS = $identity.PemPath

    if ($Action -eq 'Configure') {
        Protect-RitimConfigDirectory $keycloak
        $env:OIDC_FIXTURE_DIR = $identity.Home
        $env:OIDC_APP_ORIGIN = $identity.AppOrigin
        if (-not (Test-Path -LiteralPath (Join-Path $identity.Home 'users.json'))) {
            $env:OIDC_TEST_PASSWORD = Get-RitimSecretText $identity.ManagerPassword
            try { Invoke-LocalNode 'backend/oidc-dev/prepare.cjs' }
            finally { Remove-Item Env:OIDC_TEST_PASSWORD -ErrorAction SilentlyContinue }
        }
        $import = Join-Path $keycloak 'data/import'
        New-Item -ItemType Directory -Path $import -Force | Out-Null
        $realmFile = Join-Path $identity.Home 'realm.json'
        if (Test-Path -LiteralPath $realmFile) {
            Copy-Item -LiteralPath $realmFile -Destination (Join-Path $import 'ritim-dev-realm.json')
        }
        $env:PGHOST=$database.Host; $env:PGPORT=[string]$database.Port; $env:PGDATABASE=$database.Database
        $env:PGUSER=$database.MigrationUser; $env:PGPASSWORD=Get-RitimSecretText $database.MigrationPassword
        $env:PGOPTIONS='-c search_path=' + $database.Schema
        $env:RITIM_LOCAL_TENANT_ID=$identity.TenantId; $env:RITIM_LOCAL_SITE_ID=$identity.SiteId
        $env:OIDC_ISSUER=$identity.Issuer
        Invoke-LocalNode 'scripts/windows/seed-local-identity.cjs'
        Write-Output 'Local test identities provisioned. Username: manager. Credential is protected with Windows DPAPI; the verification launcher can sign in automatically.'
    } elseif ($Action -eq 'Start') {
        $env:KC_BOOTSTRAP_ADMIN_USERNAME='ritim-local-admin'
        $env:KC_BOOTSTRAP_ADMIN_PASSWORD=Get-RitimSecretText $identity.AdminPassword
        $env:KC_HTTPS_KEY_STORE_PASSWORD=Get-RitimSecretText $identity.PfxPassword
        & (Join-Path $keycloak 'bin/kc.bat') start-dev --http-enabled=false --http-host=127.0.0.1 --https-port=44739 ('--https-key-store-file=' + $identity.PfxPath) --https-key-store-type=PKCS12 --hostname=https://localhost:44739 --import-realm
        if ($LASTEXITCODE -ne 0) { throw 'Local Keycloak startup failed.' }
    } elseif ($Action -eq 'Api') {
        Set-RitimRuntimeEnvironment $database
        $env:OIDC_ISSUER=$identity.Issuer; $env:OIDC_AUDIENCE='ritim-api'; $env:OIDC_JWKS_URL=$identity.Issuer + '/protocol/openid-connect/certs'
        $env:OIDC_BFF_CLIENT_ID='ritim-web'; $env:OIDC_BFF_APP_ORIGIN=$identity.AppOrigin; $env:OIDC_BFF_REDIRECT_URI=$identity.AppOrigin + '/auth/callback'
        $env:RECOVERY_ENCRYPTION_KEY=Get-RitimSecretText $identity.RecoveryKey
        $env:RECOVERY_KEY_VERSION='local-dev-v1'
        Invoke-LocalNode 'backend/src/server.js'
    } elseif ($Action -eq 'VerifyOrder') {
        Set-RitimRuntimeEnvironment $database
        $env:RITIM_LOCAL_LOGIN_PASSWORD=Get-RitimSecretText $identity.ManagerPassword
        $env:RITIM_LOCAL_TENANT_ID=$identity.TenantId; $env:RITIM_LOCAL_SITE_ID=$identity.SiteId
        try { Invoke-LocalNode 'scripts/windows/verify-local-order.cjs' }
        finally { Remove-Item Env:RITIM_LOCAL_LOGIN_PASSWORD -ErrorAction SilentlyContinue }
    }
} finally {
    foreach ($name in @('PGPASSWORD','KC_BOOTSTRAP_ADMIN_PASSWORD','KC_HTTPS_KEY_STORE_PASSWORD','RECOVERY_ENCRYPTION_KEY')) { Remove-Item ('Env:' + $name) -ErrorAction SilentlyContinue }
    Pop-Location
}
