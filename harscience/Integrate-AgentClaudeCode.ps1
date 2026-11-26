<#
.SYNOPSIS
Make Agent-ClaudeCode a built-in mode of an installed HarScience (or HarGlobal) desktop app.

.DESCRIPTION
HarScience does not install its profile from the registry at launch. It materialises the
profile tree from two seed artifacts:

  resources/seed/profile-files.tar      plain files of the profile tree
  resources/seed/profile-links.json     hard links into the content-addressed pnpm store

and it verifies resources/seed/integrity.json before it touches anything. A package that is
declared in the seed manifest but absent from those two artifacts does not "fail to load":
the materialiser throws on the first missing link. So being built in means three edits, in
this order, with the integrity file rewritten last:

  1. put the plugin tarball in resources/seed/plugins/ and declare it in the seed
     package.json (dependency + profile bundle);
  2. append the package's files into profile-files.tar so the materialised tree contains
     it, with no install step and no network;
  3. recompute the integrity records for exactly the files that changed.

The live profile of the running installation is then updated the same way a user-installed
plugin is: a dependency, a bundle entry, and the package extracted into node_modules. The
running app picks it up on the next start; the seed edits make it survive a profile
re-materialisation and make it part of every fresh install of this app tree.

Everything is written with a backup and verified afterwards. Re-running the script is safe:
each step checks the current state first.

.PARAMETER HarScienceRoot
The application directory. Default: %LOCALAPPDATA%\HarScience.

.PARAMETER PluginTgz
Path to agent-claudecode-<version>.tgz. Default: the copy next to this script.

.PARAMETER SkipSeed
Do not touch resources/seed (useful on a machine where the app re-materialises profiles and
you only want the live profile updated).

.PARAMETER SkipProfile
Do not touch the live profile (useful when preparing a distribution image).

.PARAMETER DryRun
Report the planned edits and change nothing.

.EXAMPLE
.\Integrate-AgentClaudeCode.ps1
.EXAMPLE
.\Integrate-AgentClaudeCode.ps1 -HarScienceRoot 'C:\Apps\HarScience' -DryRun
#>
[CmdletBinding()]
param(
  [string]$HarScienceRoot = (Join-Path $env:LOCALAPPDATA 'HarScience'),
  [string]$PluginTgz,
  [switch]$SkipSeed,
  [switch]$SkipProfile,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$PackageName = 'agent-claudecode'
$PresetId = 'agent-claudecode'
$SkillId = 'claudecode-workflow'

function Write-Step($message) { Write-Host "== $message" -ForegroundColor Cyan }
function Write-Note($message) { Write-Host "   $message" -ForegroundColor DarkGray }
function Write-Warn($message) { Write-Host "   $message" -ForegroundColor Yellow }

function Read-Json($path) {
  return (Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json)
}

function Write-Json($path, $value) {
  $text = $value | ConvertTo-Json -Depth 100
  [System.IO.File]::WriteAllText($path, $text + "`n", (New-Object System.Text.UTF8Encoding $false))
}

function Get-Sha256($path) {
  return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Backup-File($path) {
  if (-not (Test-Path -LiteralPath $path)) { return }
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $backup = "$path.bak-$stamp"
  if (-not (Test-Path -LiteralPath $backup)) { Copy-Item -LiteralPath $path -Destination $backup -Force }
  Write-Note "backup: $([System.IO.Path]::GetFileName($backup))"
}

# ------------------------------------------------------------------ locate ---

if (-not (Test-Path -LiteralPath $HarScienceRoot)) {
  throw "application directory not found: $HarScienceRoot"
}
$seed = Join-Path $HarScienceRoot 'resources\seed'
$profile = Join-Path $HarScienceRoot 'data\profiles\desktop'
$dataHome = Join-Path $HarScienceRoot 'data'

if (-not $PluginTgz) {
  $PluginTgz = Get-ChildItem -LiteralPath $PSScriptRoot -Filter "$PackageName-*.tgz" -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $PluginTgz -or -not (Test-Path -LiteralPath $PluginTgz)) {
  throw "plugin tarball not found; pass -PluginTgz <path to $PackageName-<version>.tgz>"
}

$tgzName = [System.IO.Path]::GetFileName($PluginTgz)
$version = ($tgzName -replace "^$([regex]::Escape($PackageName))-", '' -replace '\.tgz$', '')
Write-Step "Agent-ClaudeCode $version -> $HarScienceRoot"
Write-Note "plugin: $tgzName ($([Math]::Round((Get-Item -LiteralPath $PluginTgz).Length / 1KB, 1)) KB)"

# ------------------------------------------------------------- stage files ---

$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("agent-claudecode-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
try {
  & tar -xzf $PluginTgz -C $stage
  if ($LASTEXITCODE -ne 0) { throw "could not extract $tgzName" }
  $stagedPackage = Join-Path $stage 'package'
  foreach ($required in 'package.json', 'cordis.patch.yml', 'lib\workflow.js', "presets\$PresetId\agent.cordis.yml") {
    if (-not (Test-Path -LiteralPath (Join-Path $stagedPackage $required))) {
      throw "the tarball is not an Agent-ClaudeCode package: missing $required"
    }
  }

  # ------------------------------------------------------------ seed edits ---

  if (-not $SkipSeed) {
    if (-not (Test-Path -LiteralPath $seed)) { throw "seed directory not found: $seed" }
    $seedPackages = Join-Path $seed 'package.json'
    $seedTar = Join-Path $seed 'profile-files.tar'
    $seedIntegrity = Join-Path $seed 'integrity.json'
    foreach ($required in $seedPackages, $seedTar, $seedIntegrity) {
      if (-not (Test-Path -LiteralPath $required)) { throw "seed is not the expected layout: missing $required" }
    }

    Write-Step 'seed: declare the plugin'
    $seedManifest = Read-Json $seedPackages
    $spec = "file:./plugins/$tgzName"
    $alreadyDeclared = $null -ne $seedManifest.dependencies.$PackageName
    if ($DryRun) {
      Write-Note "would set dependencies.$PackageName = $spec and add the bundle entry"
    } else {
      Backup-File $seedPackages
      $deps = @{}
      foreach ($property in $seedManifest.dependencies.PSObject.Properties) { $deps[$property.Name] = $property.Value }
      $deps[$PackageName] = $spec
      $sorted = [ordered]@{}
      foreach ($key in ($deps.Keys | Sort-Object)) { $sorted[$key] = $deps[$key] }
      $seedManifest.dependencies = $sorted
      $bundles = @($seedManifest.dsh.profile.bundles)
      if (-not ($bundles -contains $PackageName)) { $bundles += $PackageName }
      $seedManifest.dsh.profile.bundles = $bundles
      Write-Json $seedPackages $seedManifest
      Write-Note "dependencies.$PackageName = $spec (was already declared: $alreadyDeclared)"
      Write-Note "profile bundles: $($bundles.Count) entries"
    }

    Write-Step 'seed: copy the plugin tarball'
    $seedPlugin = Join-Path $seed "plugins\$tgzName"
    if ($DryRun) {
      Write-Note "would copy to $seedPlugin"
    } else {
      New-Item -ItemType Directory -Force -Path (Split-Path $seedPlugin) | Out-Null
      Copy-Item -LiteralPath $PluginTgz -Destination $seedPlugin -Force
      Write-Note "$tgzName ($([Math]::Round((Get-Item -LiteralPath $seedPlugin).Length / 1KB, 1)) KB)"
    }

    Write-Step "seed: append node_modules\$PackageName into profile-files.tar"
    if ($DryRun) {
      Write-Note 'would append the package files under node_modules/<package>/'
    } else {
      $already = (& tar -tf $seedTar) -join "`n"
      if ($already -match "node_modules/$PackageName/") {
        Write-Note 'already present; the tarball is left untouched'
      } else {
        Backup-File $seedTar
        $payload = Join-Path $stage 'payload'
        New-Item -ItemType Directory -Force -Path (Join-Path $payload "node_modules\$PackageName") | Out-Null
        Copy-Item -Path (Join-Path $stagedPackage '*') -Destination (Join-Path $payload "node_modules\$PackageName") -Recurse -Force
        Push-Location $payload
        try {
          & tar -rf $seedTar "node_modules/$PackageName"
          if ($LASTEXITCODE -ne 0) { throw 'tar append failed' }
        } finally { Pop-Location }
        Write-Note "appended; archive is now $([Math]::Round((Get-Item -LiteralPath $seedTar).Length / 1MB, 1)) MB"
      }
    }

    Write-Step 'seed: rewrite integrity.json'
    if ($DryRun) {
      Write-Note 'would recompute the records for package.json, profile-files.tar and plugins/<tgz>'
    } else {
      Backup-File $seedIntegrity
      $integrity = Read-Json $seedIntegrity
      $records = @{}
      foreach ($record in $integrity.files) { $records[$record.path] = $record }
      $changed = @('package.json', 'profile-files.tar', "plugins/$tgzName")
      foreach ($relative in $changed) {
        $absolute = Join-Path $seed ($relative -replace '/', '\')
        if (-not (Test-Path -LiteralPath $absolute)) { throw "cannot record integrity for missing file: $relative" }
        $records[$relative] = [pscustomobject]@{
          path = $relative
          bytes = (Get-Item -LiteralPath $absolute).Length
          sha256 = Get-Sha256 $absolute
        }
      }
      $ordered = @()
      foreach ($key in ($records.Keys | Sort-Object)) { $ordered += $records[$key] }
      $integrity.files = $ordered
      Write-Json $seedIntegrity $integrity
      Write-Note "records: $($ordered.Count) files"
    }
  } else {
    Write-Note 'seed edits skipped (-SkipSeed)'
  }

  # --------------------------------------------------------- live profile ---

  if (-not $SkipProfile) {
    $profileManifest = Join-Path $profile 'package.json'
    if (-not (Test-Path -LiteralPath $profileManifest)) {
      Write-Warn "no live profile at $profile; the app will materialise one from the seed on first start"
    } else {
      Write-Step 'profile: declare the plugin'
      $profileJson = Read-Json $profileManifest
      $spec = "file:../plugins/$tgzName"
      if ($DryRun) {
        Write-Note "would set dependencies.$PackageName = $spec and add the bundle entry"
      } else {
        Backup-File $profileManifest
        $deps = @{}
        foreach ($property in $profileJson.dependencies.PSObject.Properties) { $deps[$property.Name] = $property.Value }
        $deps[$PackageName] = $spec
        $sorted = [ordered]@{}
        foreach ($key in ($deps.Keys | Sort-Object)) { $sorted[$key] = $deps[$key] }
        $profileJson.dependencies = $sorted
        $bundles = @($profileJson.dsh.profile.bundles)
        if (-not ($bundles -contains $PackageName)) { $bundles += $PackageName }
        $profileJson.dsh.profile.bundles = $bundles
        Write-Json $profileManifest $profileJson
        Write-Note "dependencies.$PackageName = $spec; bundles: $($bundles.Count)"
      }

      Write-Step 'profile: place the package in node_modules'
      $target = Join-Path $profile "node_modules\$PackageName"
      if ($DryRun) {
        Write-Note "would write $target"
      } else {
        if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
        New-Item -ItemType Directory -Force -Path $target | Out-Null
        Copy-Item -Path (Join-Path $stagedPackage '*') -Destination $target -Recurse -Force
        Write-Note "$target ($((Get-ChildItem -LiteralPath $target -Recurse -File).Count) files)"
      }

      Write-Step 'profile plugins: keep a copy next to the other profile plugins'
      $profilePlugin = Join-Path $profile "plugins\$tgzName"
      if ($DryRun) {
        Write-Note "would copy to $profilePlugin"
      } else {
        New-Item -ItemType Directory -Force -Path (Split-Path $profilePlugin) | Out-Null
        Copy-Item -LiteralPath $PluginTgz -Destination $profilePlugin -Force
      }
    }
  } else {
    Write-Note 'live profile edits skipped (-SkipProfile)'
  }

  # --------------------------------------------------- preset & skill trees ---

  Write-Step 'data home: publish the preset tree and the skill'
  $presetTarget = Join-Path $dataHome ".agent-presets\$PresetId"
  $skillTarget = Join-Path $dataHome "skills\$SkillId"
  if ($DryRun) {
    Write-Note "would publish $presetTarget and $skillTarget"
  } else {
    New-Item -ItemType Directory -Force -Path $presetTarget | Out-Null
    Copy-Item -Path (Join-Path $stagedPackage "presets\$PresetId\*") -Destination $presetTarget -Force -Recurse
    New-Item -ItemType Directory -Force -Path $skillTarget | Out-Null
    Copy-Item -Path (Join-Path $stagedPackage "skills\$SkillId\*") -Destination $skillTarget -Force -Recurse
    Write-Note "preset: $presetTarget"
    Write-Note "skill:  $skillTarget"
  }

  # ------------------------------------------------------------- verification -

  Write-Step 'verify'
  if ($DryRun) {
    Write-Note 'dry run: nothing to verify'
  } else {
    $problems = @()
    if (-not $SkipSeed) {
      $integrity = Read-Json (Join-Path $seed 'integrity.json')
      foreach ($record in $integrity.files) {
        $absolute = Join-Path $seed ($record.path -replace '/', '\')
        if (-not (Test-Path -LiteralPath $absolute)) { $problems += "missing seed file $($record.path)"; continue }
        $size = (Get-Item -LiteralPath $absolute).Length
        if ($size -ne $record.bytes) { $problems += "size mismatch $($record.path) ($size != $($record.bytes))" }
        if ((Get-Sha256 $absolute) -ne $record.sha256) { $problems += "sha256 mismatch $($record.path)" }
      }
      $seedManifest = Read-Json (Join-Path $seed 'package.json')
      if (-not $seedManifest.dsh.profile.bundles -contains $PackageName) { $problems += "seed package.json is missing the $PackageName bundle" }
      $listing = (& tar -tf (Join-Path $seed 'profile-files.tar')) -join "`n"
      if ($listing -notmatch "node_modules/$PackageName/lib/workflow\.js") { $problems += 'profile-files.tar does not contain the package' }
    }
    if (-not $SkipProfile -and (Test-Path -LiteralPath (Join-Path $profile 'package.json'))) {
      $profileJson = Read-Json (Join-Path $profile 'package.json')
      if (-not $profileJson.dsh.profile.bundles -contains $PackageName) { $problems += 'live profile is missing the bundle entry' }
      if ($null -eq $profileJson.dependencies.$PackageName) { $problems += 'live profile is missing the dependency' }
      $entry = Join-Path $profile "node_modules\$PackageName\lib\workflow.js"
      if (-not (Test-Path -LiteralPath $entry)) { $problems += 'live profile node_modules is missing lib/workflow.js' }
      $node = Get-Command node -ErrorAction SilentlyContinue
      if ($null -eq $node) {
        Write-Note 'node is not on PATH; module resolution check skipped'
      } else {
        $resolved = & node -e "try{console.log(require.resolve('$PackageName/package.json',{paths:[process.argv[1]]}))}catch(e){console.log('UNRESOLVED')}" $profile
        if ($resolved -notmatch 'agent-claudecode') { $problems += "node cannot resolve $PackageName from the profile: $resolved" }
      }
    }
    if ($problems.Count -gt 0) {
      foreach ($problem in $problems) { Write-Warn $problem }
      throw "integration finished with $($problems.Count) verification problem(s); restore the .bak-* files if the app misbehaves"
    }
    Write-Note 'seed integrity, bundle entries, tarball contents and module resolution all check out'
    Write-Host ''
    Write-Host "Agent-ClaudeCode $version is built in. Restart the app, then pick it in the mode list." -ForegroundColor Green
  }
}
finally {
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue }
}