[CmdletBinding()]
param(
  [string]$ManifestPath = "webart.package.json",
  [string]$StagePath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$taskWorkspacePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$collectionScript = Join-Path $PSScriptRoot "collection.mjs"
$validatedJson = & node $collectionScript files-manifest $ManifestPath
if ($LASTEXITCODE -ne 0) { throw "Template approval/source gate failed; no archive was written." }
$validated = ($validatedJson -join "`n") | ConvertFrom-Json
$packageConfig = $validated.config
if (-not $StagePath) {
  # Keep direct invocations on the same verified receipt/catalog path as npm release.
  & node (Join-Path $PSScriptRoot "release-collection.mjs") --id $packageConfig.slug
  if ($LASTEXITCODE -ne 0) { throw "Verified collection release failed." }
  return
}
$outputPath = [IO.Path]::GetFullPath((Join-Path $taskWorkspacePath $packageConfig.output))
$systemTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$systemTempPrefix = $systemTempRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$temporaryArchivePath = Join-Path $systemTempRoot ("webart-{0}-{1}.zip" -f $packageConfig.slug, [Guid]::NewGuid().ToString("N"))
if ($StagePath) {
  $outputPath = [IO.Path]::GetFullPath($StagePath)
  if (-not $outputPath.StartsWith($systemTempPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Staged archive must stay inside the system temp directory." }
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
try {
  $archive = [IO.Compression.ZipFile]::Open($temporaryArchivePath, [IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($file in $validated.files) {
      [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.source, $file.archive, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
  }
  finally { $archive.Dispose() }

  # Verify the exact approved bytes and a clean build while the ZIP is still private.
  & (Join-Path $PSScriptRoot "verify-package.ps1") -ManifestPath $ManifestPath -ArchivePath $temporaryArchivePath
  & node $collectionScript check-manifest $ManifestPath
  if ($LASTEXITCODE -ne 0) { throw "Approved source changed during packaging." }
  $outputDirectory = Split-Path -Parent $outputPath
  if (-not (Test-Path -LiteralPath $outputDirectory -PathType Container)) { throw "Output directory does not exist: $outputDirectory" }
  Move-Item -LiteralPath $temporaryArchivePath -Destination $outputPath -Force
  $archiveFile = Get-Item -LiteralPath $outputPath
  $archiveStream = [IO.File]::OpenRead($outputPath)
  $archiveSha256 = [Security.Cryptography.SHA256]::Create()
  try { $archiveHash = [BitConverter]::ToString($archiveSha256.ComputeHash($archiveStream)).Replace("-", "").ToLowerInvariant() }
  finally { $archiveStream.Dispose(); $archiveSha256.Dispose() }
  [ordered]@{
    slug = $packageConfig.slug
    version = $packageConfig.version
    output = $outputPath
    bytes = $archiveFile.Length
    sha256 = $archiveHash
    entries = @($validated.files).Count
    cleanBuild = "passed"
  } | ConvertTo-Json
}
finally {
  if (Test-Path -LiteralPath $temporaryArchivePath) { Remove-Item -LiteralPath $temporaryArchivePath -Force }
}
