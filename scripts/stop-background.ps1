$ErrorActionPreference = 'Stop'
$taskProjectRoot = Split-Path -Parent $PSScriptRoot
$taskPidPath = Join-Path $taskProjectRoot '.private\server\service.pid'
if (Test-Path -LiteralPath $taskPidPath) {
  $taskServicePid = Get-Content -LiteralPath $taskPidPath -Raw
  $taskProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $taskServicePid" -ErrorAction SilentlyContinue
  if ($taskProcess -and $taskProcess.CommandLine -like '*paris-stays*background-service.mjs*') {
    Get-CimInstance Win32_Process -Filter "ParentProcessId = $taskServicePid" | Where-Object { $_.Name -eq 'cloudflared.exe' } | ForEach-Object { Stop-Process -Id $_.ProcessId }
    Stop-Process -Id $taskServicePid
  }
}
Write-Output 'Collector stopped. The GitHub Pages site still works from its static snapshot.'
