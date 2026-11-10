$ErrorActionPreference = 'Stop'
$demoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$demoAddress = 'http://127.0.0.1:62949/demo/index.html'
try { $demoResponse = Invoke-WebRequest -Uri $demoAddress -UseBasicParsing -TimeoutSec 3 } catch { $demoResponse = $null }
if (-not $demoResponse) {
    $demoNode = (Get-Command node -ErrorAction Stop).Source
    Start-Process -FilePath $demoNode -ArgumentList 'scripts/verify-ui-modernization.cjs','--serve-only' -WorkingDirectory $demoRoot -WindowStyle Hidden
    for ($demoAttempt = 0; $demoAttempt -lt 20; $demoAttempt++) {
        Start-Sleep -Milliseconds 250
        try { $demoResponse = Invoke-WebRequest -Uri $demoAddress -UseBasicParsing -TimeoutSec 2; break } catch { }
    }
}
if (-not $demoResponse -or $demoResponse.Content -notmatch 'presentation.js') { throw 'Demo sunumu acilamadi. 62949 portunu ve yerel sunucuyu kontrol edin.' }
Start-Process $demoAddress
