param([ValidatePattern('^[a-z0-9]+(?:-[a-z0-9]+)*$')][string]$Profile='collection',[int]$Port=0,[switch]$Foreground)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$taskConfig=Get-Content -Raw -LiteralPath (Join-Path $taskRoot 'webart.previews.json') | ConvertFrom-Json
if($Profile -notin $taskConfig.PSObject.Properties.Name){throw 'Unknown preview profile; register the directory, port and page identity first.'}
$taskPreview=$taskConfig.$Profile
if(-not $taskPreview.directory -or -not $taskPreview.title -or $taskPreview.port -lt 1 -or $taskPreview.port -gt 65535){throw 'Invalid registered preview profile.'}
if($Port -and $Port -ne $taskPreview.port){throw 'Use the port registered for this preview profile.'}
$Port=$taskPreview.port
$taskProject=[IO.Path]::GetFullPath((Join-Path $taskRoot $taskPreview.directory))
if($taskProject -ne $taskRoot -and -not $taskProject.StartsWith($taskRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Preview directory escapes the workspace.'}
$taskIdentity=$null
if($taskPreview.rendererId){
 & node (Join-Path $taskRoot 'scripts/renderer-preview.mjs') $taskPreview.rendererId
 if($LASTEXITCODE -ne 0){throw 'Qualified renderer preview preparation failed.'}
 $taskIdentity=Get-Content -Raw -LiteralPath (Join-Path $taskProject 'dist/webart-preview.json') | ConvertFrom-Json
 if($taskIdentity.rendererId -ne $taskPreview.rendererId){throw 'Preview directory does not match the registered renderer.'}
}
if(-not (Test-Path -LiteralPath (Join-Path $taskProject 'dist/index.html'))){throw 'The configured preview has no built page.'}
$taskUrl="http://127.0.0.1:$Port/"
function Test-TaskPreview {
 try{
  $taskResponse=Invoke-WebRequest -Uri $taskUrl -TimeoutSec 2 -UseBasicParsing
  if($taskResponse.StatusCode -ne 200 -or $taskResponse.Content -notmatch [regex]::Escape($taskPreview.title)){return $false}
  if($taskIdentity){$taskRemote=Invoke-RestMethod -Uri ($taskUrl+'webart-preview.json') -TimeoutSec 2;return $taskRemote.rendererId -eq $taskIdentity.rendererId -and $taskRemote.sourceSha256 -eq $taskIdentity.sourceSha256 -and $taskRemote.archiveSha256 -eq $taskIdentity.archiveSha256}
  return $true
 }catch{return $false}
}
if(Test-TaskPreview){Write-Output "Preview ready: $taskUrl";exit 0}
$taskState=Join-Path $taskRoot '.webart/preview-services'
if(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue){
 $taskStateFile=Join-Path $taskState "$Profile.json"
 if(-not $taskIdentity -or -not(Test-Path -LiteralPath $taskStateFile)){throw "Port $Port is occupied by another service."}
 $taskOld=Get-Content -Raw -LiteralPath $taskStateFile | ConvertFrom-Json
 $taskOldDirectory=[IO.Path]::GetFullPath($taskOld.directory)
 if($taskOld.profile -ne $Profile -or $taskOld.url -ne $taskUrl -or -not $taskOldDirectory.StartsWith($taskRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Cannot restart an unrecognized preview.'}
 $taskOldProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$taskOld.pid)"
 $taskOldVite=Join-Path $taskOldDirectory 'node_modules/vite/bin/vite.js'
 if(-not $taskOldProcess -or $taskOldProcess.Name -ne 'node.exe' -or $taskOldProcess.CommandLine.Replace('\','/') -notlike ('*'+$taskOldVite.Replace('\','/')+'*') -or $taskOldProcess.CommandLine -notmatch ('--port\s+'+[regex]::Escape("$Port")+'\b')){throw 'Port ownership does not match the managed preview.'}
 Stop-Process -Id $taskOld.pid
 for($taskAttempt=0;$taskAttempt -lt 20;$taskAttempt++){if(-not(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)){break};Start-Sleep -Milliseconds 100}
 if(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue){throw 'Managed preview did not release its port.'}
}
$taskNode=(Get-Command node -ErrorAction Stop).Source
$taskVite=Join-Path $taskProject 'node_modules/vite/bin/vite.js'
if($Foreground){Push-Location $taskProject;try{& $taskNode $taskVite preview --host 127.0.0.1 --port $Port --strictPort}finally{Pop-Location};exit $LASTEXITCODE}
New-Item -ItemType Directory -Path $taskState -Force | Out-Null
$taskProcess=Start-Process -FilePath $taskNode -ArgumentList @($taskVite,'preview','--host','127.0.0.1','--port',"$Port",'--strictPort') -WorkingDirectory $taskProject -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskState "$Profile.stdout.log") -RedirectStandardError (Join-Path $taskState "$Profile.stderr.log") -PassThru
@{profile=$Profile;pid=$taskProcess.Id;url=$taskUrl;directory=$taskProject;started=[DateTimeOffset]::Now.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskState "$Profile.json")
for($taskAttempt=0;$taskAttempt -lt 40;$taskAttempt++){if(Test-TaskPreview){Write-Output "Preview ready: $taskUrl";exit 0};Start-Sleep -Milliseconds 150}
throw "Preview did not become healthy; inspect .webart/preview-services/$Profile.stderr.log."
