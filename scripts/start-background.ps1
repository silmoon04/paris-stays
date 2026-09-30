param([switch]$InstallStartup)
$ErrorActionPreference = 'Stop'
$taskProjectRoot = Split-Path -Parent $PSScriptRoot
$taskServerPath = Join-Path $taskProjectRoot '.private\server'
New-Item -ItemType Directory -Path $taskServerPath -Force | Out-Null
$taskNodePath = (Get-Command node.exe).Source
$taskCloudflarePath = (Get-Command cloudflared.exe).Source
$env:PARIS_CLOUDFLARED = $taskCloudflarePath
$taskPidPath = Join-Path $taskServerPath 'service.pid'
$taskAlreadyRunning = $false
if (Test-Path -LiteralPath $taskPidPath) {
  $taskPreviousPid = Get-Content -LiteralPath $taskPidPath -Raw
  $taskProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $taskPreviousPid" -ErrorAction SilentlyContinue
  $taskAlreadyRunning = $taskProcess -and $taskProcess.CommandLine -like '*paris-stays*background-service.mjs*'
}
if (-not $taskAlreadyRunning) {
  $taskHelper = Join-Path $PSScriptRoot 'background-service.mjs'
  Start-Process -FilePath $taskNodePath -ArgumentList @('"' + $taskHelper + '"') -WorkingDirectory $taskProjectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskServerPath 'stdout.log') -RedirectStandardError (Join-Path $taskServerPath 'stderr.log') | Out-Null
}
if ($InstallStartup) {
  $taskShell = (Get-Command powershell.exe).Source
  $taskRunScript = Join-Path $PSScriptRoot 'run-background.ps1'
  $taskAction = New-ScheduledTaskAction -Execute $taskShell -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $taskRunScript + '"') -WorkingDirectory $taskProjectRoot
  $taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
  $taskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
  try {
    Register-ScheduledTask -TaskName 'Paris Stays Laptop Collector' -Action $taskAction -Trigger $taskTrigger -Settings $taskSettings -Description 'Optional Paris Stays collector and HTTPS tunnel; private logs stay on this laptop.' -RunLevel Limited -Force | Out-Null
    Write-Output 'Logon startup installed for the current Windows user.'
  } catch {
    $taskStartupFolder = [Environment]::GetFolderPath('Startup')
    $taskShortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $taskStartupFolder 'Paris Stays Collector.lnk'))
    $taskShortcut.TargetPath = $taskShell
    $taskShortcut.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"'
    $taskShortcut.WorkingDirectory = $taskProjectRoot
    $taskShortcut.WindowStyle = 7
    $taskShortcut.Save()
    Write-Output 'Current-user Startup shortcut installed (Task Scheduler registration was unavailable).'
  }
}
Write-Output 'Paris Stays runs in the background. Dashboard: http://127.0.0.1:8786/'
