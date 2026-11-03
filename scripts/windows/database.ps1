[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Initialize', 'Migrate', 'Provision', 'Ready', 'Backup', 'RestoreTest')]
    [string]$Action,
    [string]$Database,
    [Parameter(Mandatory = $true)][string]$ConfirmDatabase,
    [ValidateSet('127.0.0.1', 'localhost', '::1')][string]$DatabaseHost = '127.0.0.1',
    [ValidateRange(1,65535)][int]$Port = 5432,
    [string]$AdminUser = 'postgres',
    [switch]$EnableDevelopmentMutations,
    [string]$BackupFile,
    [string]$RestoreDatabase
)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
. (Join-Path $PSScriptRoot 'local-config.ps1')
$configFile = Get-RitimDatabaseConfigPath $projectRoot
$portableNode = Join-Path $env:LOCALAPPDATA 'RitimFlowLite/tools/node-v22.20.0-win-x64'
if (Test-Path -LiteralPath (Join-Path $portableNode 'node.exe')) { $env:PATH = $portableNode + ';' + $env:PATH }
$nodeMajor = & node -p 'process.versions.node.slice(0,2)'
if ($LASTEXITCODE -ne 0 -or $nodeMajor -ne '22') { throw 'Node 22 required.' }

function New-RitimSecret {
    $bytes = New-Object byte[] 32
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($bytes) } finally { $random.Dispose() }
    return ConvertTo-SecureString ([Convert]::ToBase64String($bytes)) -AsPlainText -Force
}
function Invoke-DatabaseAction {
    param([string]$Operation)
    $env:RITIM_DATABASE_ACTION = $Operation
    & node (Join-Path $PSScriptRoot 'database-operations.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'Database operation failed. Existing objects are preserved; no reset is attempted.' }
}

$managedVariables = @('PGHOST','PGPORT','PGDATABASE','RITIM_DB_SCHEMA','RITIM_ISOLATED_DEVELOPMENT','RITIM_MIGRATION_USER','RITIM_MIGRATION_PASSWORD','RITIM_RUNTIME_USER','RITIM_RUNTIME_PASSWORD','RITIM_ADMIN_USER','RITIM_ADMIN_PASSWORD','RITIM_DATABASE_ACTION','RITIM_BACKUP_FILE','RITIM_RESTORE_DATABASE')
$previous = @{}
foreach ($name in $managedVariables) { $previous[$name] = [Environment]::GetEnvironmentVariable($name) }
try {
    if ($Action -eq 'Initialize') {
        if ($Database -notmatch '^ritim_[a-z0-9_]+_dev$' -or $Database.Length -gt 45 -or $ConfirmDatabase -ne $Database) {
            throw 'Specify a new ritim_*_dev database and repeat its exact name with -ConfirmDatabase.'
        }
        if (Test-Path -LiteralPath $configFile) { throw 'Local configuration already exists. Refusing to overwrite. Use Migrate/Provision/Ready, or inspect incomplete initialization.' }
        $admin = Get-Credential -UserName $AdminUser -Message 'PostgreSQL provisioning only. Password stays local; never paste it into chat.'
        if (-not $admin) { throw 'Database credential entry cancelled.' }
        Protect-RitimConfigDirectory (Split-Path -Parent $configFile)
        $config = [pscustomobject]@{
            Version = 1; Host = $DatabaseHost; Port = $Port; Database = $Database; Schema = 'ritim'
            MigrationUser = $Database + '_migration'; MigrationPassword = New-RitimSecret
            RuntimeUser = $Database + '_runtime'; RuntimePassword = New-RitimSecret
            IsolatedDevelopment = [bool]$EnableDevelopmentMutations; Initialized = $false
        }
        # Windows DPAPI encrypts SecureString fields for the current Windows account.
        # Save before provisioning so partial failures do not lose the newly generated role passwords.
        $config | Export-Clixml -LiteralPath $configFile
    } else {
        if (-not (Test-Path -LiteralPath $configFile)) { throw 'Initialize the local development database first.' }
        $config = Import-Clixml -LiteralPath $configFile
        if ($config.Version -ne 1 -or -not $config.Initialized) { throw 'Incomplete or unsupported local configuration; inspect it before further operations.' }
        if ($ConfirmDatabase -ne $config.Database) { throw 'Confirmation does not match the configured development database.' }
    }
    $env:PGHOST = $config.Host; $env:PGPORT = [string]$config.Port; $env:PGDATABASE = $config.Database
    $env:RITIM_DB_SCHEMA = $config.Schema
    $env:RITIM_ISOLATED_DEVELOPMENT = ([bool]$config.IsolatedDevelopment).ToString().ToLowerInvariant()
    $env:RITIM_MIGRATION_USER = $config.MigrationUser
    $env:RITIM_MIGRATION_PASSWORD = Get-RitimSecretText $config.MigrationPassword
    $env:RITIM_RUNTIME_USER = $config.RuntimeUser
    $env:RITIM_RUNTIME_PASSWORD = Get-RitimSecretText $config.RuntimePassword
    if ($Action -in @('Initialize','Backup','RestoreTest')) {
        if (-not $admin) { $admin = Get-Credential -UserName $AdminUser -Message 'PostgreSQL provisioning/backup only. Password stays local; never paste it into chat.' }
        if (-not $admin) { throw 'Database credential entry cancelled.' }
        $env:RITIM_ADMIN_USER = $admin.UserName
        $env:RITIM_ADMIN_PASSWORD = $admin.GetNetworkCredential().Password
    }
    if ($Action -eq 'Initialize') {
        Invoke-DatabaseAction 'Initialize'
        Invoke-DatabaseAction 'Migrate'
        Invoke-DatabaseAction 'Provision'
        Invoke-DatabaseAction 'Ready'
        $config.Initialized = $true
        $config | Export-Clixml -LiteralPath $configFile
        Write-Output 'Dedicated development database initialized. No fictional fixtures loaded. OIDC login is not configured by this command.'
    } else {
        if ($Action -in @('Backup','RestoreTest')) {
            $pgBin = Join-Path $env:ProgramFiles 'PostgreSQL/18/bin'
            if ($env:RITIM_PG_BIN) { $pgBin = $env:RITIM_PG_BIN }
            if (-not (Test-Path -LiteralPath $pgBin)) { throw 'Compatible PostgreSQL client tools required.' }
            if ($Action -eq 'Backup' -and -not $BackupFile) {
                $backupDirectory = Join-Path (Split-Path -Parent $configFile) 'backups'
                New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
                $BackupFile = Join-Path $backupDirectory ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N') + '.dump')
            }
            if (-not $BackupFile -or -not [IO.Path]::IsPathRooted($BackupFile)) { throw 'An absolute backup file path is required.' }
            $env:RITIM_BACKUP_FILE = $BackupFile
            $env:RITIM_RESTORE_DATABASE = $RestoreDatabase
        }
        Invoke-DatabaseAction $Action
        if ($Action -eq 'Backup') { Write-Output ('Backup saved: ' + $BackupFile) }
    }
} finally {
    foreach ($name in $managedVariables) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
