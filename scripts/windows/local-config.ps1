function Get-RitimDatabaseConfigPath {
    param([string]$ProjectRoot)
    $hash = [Security.Cryptography.SHA256]::Create()
    try { $bytes = $hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($ProjectRoot.ToLowerInvariant())) }
    finally { $hash.Dispose() }
    $tag = ([BitConverter]::ToString($bytes)).Replace('-', '').Substring(0, 16).ToLowerInvariant()
    return Join-Path $env:LOCALAPPDATA ('RitimFlowLite/config/' + $tag + '/database.clixml')
}

function Protect-RitimConfigDirectory {
    param([string]$Directory)
    New-Item -ItemType Directory -Path $Directory -Force | Out-Null
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls.exe $Directory '/inheritance:r' '/grant:r' ('*' + $sid + ':(OI)(CI)F') | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not protect the local configuration directory.' }
}

function Get-RitimIdentityConfigPath {
    param([string]$ProjectRoot)
    return Join-Path (Split-Path -Parent (Get-RitimDatabaseConfigPath $ProjectRoot)) 'identity.clixml'
}

function Get-RitimSecretText {
    param([Security.SecureString]$Secret)
    return (New-Object System.Management.Automation.PSCredential('ritim', $Secret)).GetNetworkCredential().Password
}

function Set-RitimRuntimeEnvironment {
    param($Config)
    $env:PGHOST = $Config.Host
    $env:PGPORT = [string]$Config.Port
    $env:PGDATABASE = $Config.Database
    $env:PGUSER = $Config.RuntimeUser
    $env:PGPASSWORD = Get-RitimSecretText $Config.RuntimePassword
    $env:PGOPTIONS = '-c search_path=' + $Config.Schema
    # Native local development is explicit; existing OIDC/BFF variables remain caller supplied.
    $env:NODE_ENV = 'development'
    $env:RITIM_ISOLATED_DEVELOPMENT = ([bool]$Config.IsolatedDevelopment).ToString().ToLowerInvariant()
}
