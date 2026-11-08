param(
  [switch]$Apply,
  [string[]]$Keep = @('cloud-release/android-operator-final', 'cloud-release/operator-refinement', 'native-postgres')
)
$ErrorActionPreference = 'Stop'
$artifactRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../artifacts'))
$prefix = $artifactRoot + [IO.Path]::DirectorySeparatorChar
$repoRoot = Split-Path $artifactRoot -Parent
$sourceText = (@('scripts','tests') | ForEach-Object {
  Get-ChildItem -LiteralPath (Join-Path $repoRoot $_) -Recurse -File | Where-Object { $_.Extension -in @('.js','.cjs','.mjs') } | ForEach-Object { [IO.File]::ReadAllText($_.FullName) }
}) -join "`n"
function Assert-ArtifactPath([string]$candidate) {
  $resolved = [IO.Path]::GetFullPath($candidate)
  if (-not $resolved.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Outside artifacts: $resolved" }
  return $resolved
}
$preserved = @($Keep + @('native-postgres/temp', 'cloud-setup', 'dns') | ForEach-Object { Assert-ArtifactPath (Join-Path $artifactRoot $_) })
# Do not traverse database clusters, setup files, or filesystem links.
function Get-OutputFiles([string]$directory) {
  foreach ($item in Get-ChildItem -LiteralPath $directory -Force) {
    $absolute = Assert-ArtifactPath $item.FullName
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
    if ($preserved -contains $absolute) { continue }
    if ($item.PSIsContainer) { Get-OutputFiles $absolute; continue }
    # Persisted scenario identities prevent duplicate live writes on reruns.
    if ($item.Name -match '^(checkpoint|proof)' -or $item.Extension -eq '.pdf') { continue }
    $relative = 'artifacts/' + $absolute.Substring($prefix.Length).Replace('\','/')
    if ($item.Extension -eq '.json' -and $sourceText.Contains($relative)) { continue }
    if ($item.Extension -in @('.png','.jpg','.jpeg','.webp','.gif','.html','.log','.tap','.csv','.zip','.webm','.mp4','.txt','.json')) { $item }
  }
}
$targets = @(Get-OutputFiles $artifactRoot)
$bytes = ($targets | Measure-Object -Property Length -Sum).Sum
Write-Output ("{0} old output files; {1:N1} MB; apply={2}" -f $targets.Count, ($bytes / 1MB), $Apply)
if (-not $Apply) { $targets | Select-Object -ExpandProperty FullName; exit }
foreach ($item in $targets) { Remove-Item -LiteralPath (Assert-ArtifactPath $item.FullName) -Force }
function Remove-EmptyOutputDirectories([string]$directory) {
  foreach ($item in Get-ChildItem -LiteralPath $directory -Directory -Force) {
    $absolute = Assert-ArtifactPath $item.FullName
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $preserved -contains $absolute) { continue }
    Remove-EmptyOutputDirectories $absolute
    if (@(Get-ChildItem -LiteralPath $absolute -Force).Count -eq 0) { Remove-Item -LiteralPath $absolute }
  }
}
Remove-EmptyOutputDirectories $artifactRoot
