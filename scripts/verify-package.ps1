[CmdletBinding()]
param(
  [string]$ManifestPath = "webart.package.json",
  [string]$ArchivePath = "",
  [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$taskWorkspacePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$validatedJson = & node (Join-Path $PSScriptRoot "collection.mjs") files-manifest $ManifestPath
if ($LASTEXITCODE -ne 0) { throw "Template approval/source gate failed." }
$validated = ($validatedJson -join "`n") | ConvertFrom-Json
if (-not $ArchivePath) { $ArchivePath = Join-Path $taskWorkspacePath $validated.config.output }
$resolvedArchivePath = [IO.Path]::GetFullPath($ArchivePath)
if (-not (Test-Path -LiteralPath $resolvedArchivePath -PathType Leaf)) { throw "Archive does not exist: $resolvedArchivePath" }

# An archive must contain exactly the approved allowlist, with byte-identical contents.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$expectedFiles = @{}
foreach ($file in $validated.files) { $expectedFiles[$file.archive] = $file.source }
$archive = [IO.Compression.ZipFile]::OpenRead($resolvedArchivePath)
try {
  if ($archive.Entries.Count -ne $expectedFiles.Count) { throw "Archive entry count differs from the approved allowlist." }
  $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($entry in $archive.Entries) {
    if (-not $expectedFiles.ContainsKey($entry.FullName) -or -not $seen.Add($entry.FullName)) { throw "Unexpected or duplicate archive path: $($entry.FullName)" }
    $sourcePath = $expectedFiles[$entry.FullName]
    $sourceFile = Get-Item -LiteralPath $sourcePath
    if ($sourceFile.Length -ne $entry.Length) { throw "Archive/source size differs: $($entry.FullName)" }
    $stream = $entry.Open()
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try { $entryHash = [BitConverter]::ToString($sha256.ComputeHash($stream)).Replace("-", "") }
    finally { $stream.Dispose(); $sha256.Dispose() }
    $sourceStream = [IO.File]::OpenRead($sourcePath)
    $sourceSha256 = [Security.Cryptography.SHA256]::Create()
    try { $sourceHash = [BitConverter]::ToString($sourceSha256.ComputeHash($sourceStream)).Replace("-", "") }
    finally { $sourceStream.Dispose(); $sourceSha256.Dispose() }
    if ($entryHash -ne $sourceHash) { throw "Archive/source bytes differ: $($entry.FullName)" }
  }
}
finally { $archive.Dispose() }

if ($SkipBuild) {
  [ordered]@{ archive = $resolvedArchivePath; approvedBytes = "passed"; cleanBuild = "not run" } | ConvertTo-Json
  return
}

$systemTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$systemTempPrefix = $systemTempRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$verificationPath = [IO.Path]::GetFullPath((Join-Path $systemTempRoot ("webart-package-verify-{0}" -f [Guid]::NewGuid().ToString("N"))))
if (-not $verificationPath.StartsWith($systemTempPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe verification directory." }
New-Item -ItemType Directory -Path $verificationPath | Out-Null
$previousLocation = Get-Location
try {
  [IO.Compression.ZipFile]::ExtractToDirectory($resolvedArchivePath, $verificationPath)
  Set-Location -LiteralPath $verificationPath
  & npm.cmd ci --ignore-scripts --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "Clean npm install failed with exit code $LASTEXITCODE" }
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw "Clean package build failed with exit code $LASTEXITCODE" }
  if (-not (Test-Path -LiteralPath (Join-Path $verificationPath "dist/index.html") -PathType Leaf)) { throw "Clean build did not produce dist/index.html" }
  [ordered]@{ archive = $resolvedArchivePath; approvedBytes = "passed"; cleanInstall = "passed"; cleanBuild = "passed" } | ConvertTo-Json
}
finally {
  Set-Location -LiteralPath $previousLocation
  $resolvedVerificationPath = [IO.Path]::GetFullPath($verificationPath)
  if (-not $resolvedVerificationPath.StartsWith($systemTempPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Refusing to remove unverified directory." }
  if (Test-Path -LiteralPath $resolvedVerificationPath) { Remove-Item -LiteralPath $resolvedVerificationPath -Recurse -Force }
}
