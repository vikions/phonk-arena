$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$sourceRoot = Join-Path $repoRoot 'backend\samples_packs\lunatic'
$targetRoot = Join-Path $repoRoot 'frontend\public\sounds'

if (-not (Test-Path $sourceRoot)) {
  throw "Source pack not found: $sourceRoot"
}

$audioExt = @('.wav', '.mp3', '.ogg', '.m4a')
$targetCategories = @('kicks', 'snares', 'hats', 'bass', 'fx', 'melodies')

foreach ($cat in $targetCategories) {
  $dir = Join-Path $targetRoot $cat
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }

  Get-ChildItem -Path $dir -File |
    Where-Object { $_.Name -ne '.gitkeep' -and $audioExt -contains $_.Extension.ToLowerInvariant() } |
    Remove-Item -Force

  $gitkeep = Join-Path $dir '.gitkeep'
  if (-not (Test-Path $gitkeep)) {
    Set-Content -Path $gitkeep -Value ''
  }
}

function Get-AudioFiles([string]$path) {
  if (-not (Test-Path $path)) { return @() }
  return Get-ChildItem -Path $path -Recurse -File |
    Where-Object { $audioExt -contains $_.Extension.ToLowerInvariant() }
}

function Copy-IntoCategory {
  param(
    [System.IO.FileInfo[]] $Files,
    [Parameter(Mandatory = $true)] [string] $Category
  )

  if (-not $Files -or $Files.Count -eq 0) {
    return
  }

  $destDir = Join-Path $targetRoot $Category

  foreach ($file in $Files) {
    $name = $file.Name
    $base = [System.IO.Path]::GetFileNameWithoutExtension($name)
    $ext = $file.Extension
    $destPath = Join-Path $destDir $name

    $i = 1
    while (Test-Path $destPath) {
      $destPath = Join-Path $destDir ("{0}__{1}{2}" -f $base, $i, $ext)
      $i++
    }

    Copy-Item -Path $file.FullName -Destination $destPath -Force
  }
}

$bassFiles = Get-AudioFiles (Join-Path $sourceRoot 'bass')
Copy-IntoCategory -Files $bassFiles -Category 'bass'

$fxFiles = Get-AudioFiles (Join-Path $sourceRoot 'fx')
Copy-IntoCategory -Files $fxFiles -Category 'fx'

$melodyFiles = Get-AudioFiles (Join-Path $sourceRoot 'melody')
$cowbellFiles = Get-AudioFiles (Join-Path $sourceRoot 'cowbell')
Copy-IntoCategory -Files ($melodyFiles + $cowbellFiles) -Category 'melodies'

$drumFiles = Get-AudioFiles (Join-Path $sourceRoot 'drums')

$kickFiles = @()
$snareFiles = @()
$hatFiles = @()

foreach ($file in $drumFiles) {
  $n = $file.Name.ToLowerInvariant()

  if ($n -match 'kick|808\s*kick') {
    $kickFiles += $file
    continue
  }

  if ($n -match 'hat|hihat|hi-hat|hh|shaker|open hat|closed hat|ride') {
    $hatFiles += $file
    continue
  }

  if ($n -match 'snare|clap|rim') {
    $snareFiles += $file
    continue
  }

  $snareFiles += $file
}

Copy-IntoCategory -Files $kickFiles -Category 'kicks'
Copy-IntoCategory -Files $snareFiles -Category 'snares'
Copy-IntoCategory -Files $hatFiles -Category 'hats'

# If pack has no hats, mirror a few sharp snare/clap layers as hats fallback.
$hatsDir = Join-Path $targetRoot 'hats'
$hatCount = (Get-AudioFiles $hatsDir).Count

if ($hatCount -eq 0) {
  $fallback = $snareFiles | Select-Object -First 4
  Copy-IntoCategory -Files $fallback -Category 'hats'
}

$summary = @{}
foreach ($cat in $targetCategories) {
  $summary[$cat] = (Get-AudioFiles (Join-Path $targetRoot $cat)).Count
}

Write-Output 'Lunatic pack synced to frontend/public/sounds'
$summary.GetEnumerator() | Sort-Object Name | ForEach-Object {
  Write-Output ("{0}: {1}" -f $_.Name, $_.Value)
}
