$ErrorActionPreference = 'Stop'
$taskProjectRoot = Split-Path -Parent $PSScriptRoot
$env:PARIS_CLOUDFLARED = (Get-Command cloudflared.exe).Source
$taskNode = (Get-Command node.exe).Source
& $taskNode (Join-Path $PSScriptRoot 'background-service.mjs')
exit $LASTEXITCODE
