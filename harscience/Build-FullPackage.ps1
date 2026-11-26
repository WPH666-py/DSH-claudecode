<#
.SYNOPSIS
Repack an installed HarScience tree, with Agent-ClaudeCode built into its seed, as a
distributable archive.

.DESCRIPTION
A full repack is the same artifact the vendor would ship: the application tree exactly as
installed, minus the user's `data` directory, with the seed already carrying this plugin.
Unzip it anywhere and run the contained `harscience.exe`; the app materialises a profile
that already has the mode.

The archive is large by nature (the seed alone carries the pnpm store shards), so it is
built here rather than checked in. `Integrate-AgentClaudeCode.ps1` is the small, reviewable
alternative when the recipient already has HarScience installed.

.PARAMETER Source
The installation to copy. Default: %LOCALAPPDATA%\HarScience.

.PARAMETER Output
Output archive path. Default: <repo>/dist/HarScience-AgentClaudeCode-<version>-win-x64.zip

.PARAMETER PluginTgz
The plugin tarball. Default: <repo>/dist/agent-claudecode-<version>.tgz
#>
[CmdletBinding()]
param(
  [string]$Source = (Join-Path $env:LOCALAPPDATA 'HarScience'),
  [string]$Output,
  [string]$PluginTgz
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

if (-not $PluginTgz) {
  $PluginTgz = Get-ChildItem -LiteralPath (Join-Path $repo 'dist') -Filter 'agent-claudecode-*.tgz' |
    Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $PluginTgz) { throw 'no plugin tarball found in dist/' }
$version = ([System.IO.Path]::GetFileName($PluginTgz) -replace '^agent-claudecode-', '' -replace '\.tgz$', '')
if (-not $Output) { $Output = Join-Path $repo "dist\HarScience-AgentClaudeCode-$version-win-x64.zip" }

$staging = Join-Path $repo 'dist\harscience-pkg'
if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
New-Item -ItemType Directory -Force -Path $staging | Out-Null

Write-Host "== copying $Source (data excluded)" -ForegroundColor Cyan
robocopy $Source (Join-Path $staging 'HarScience') /E /XD (Join-Path $Source 'data') /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
if ($LASTEXITCODE -gt 7) { throw "robocopy failed with $LASTEXITCODE" }

Write-Host '== integrating the seed' -ForegroundColor Cyan
& (Join-Path $PSScriptRoot 'Integrate-AgentClaudeCode.ps1') -HarScienceRoot (Join-Path $staging 'HarScience') -PluginTgz $PluginTgz -SkipProfile

# A fresh install must not inherit this machine's data directory; the app creates it.
$stagedData = Join-Path $staging 'HarScience\data'
if (Test-Path -LiteralPath $stagedData) { Remove-Item -LiteralPath $stagedData -Recurse -Force }

Write-Host "== packing $Output" -ForegroundColor Cyan
if (Test-Path -LiteralPath $Output) { Remove-Item -LiteralPath $Output -Force }
Push-Location $staging
try {
  tar -a -cf $Output 'HarScience'
  if ($LASTEXITCODE -ne 0) { throw 'packing failed' }
} finally { Pop-Location }

$size = [Math]::Round((Get-Item -LiteralPath $Output).Length / 1MB, 1)
$entries = ((& tar -tf $Output) | Measure-Object).Count
Write-Host "== $Output ($size MB, $entries entries)" -ForegroundColor Green
Write-Host '   Unzip anywhere and run HarScience\harscience.exe.' -ForegroundColor DarkGray