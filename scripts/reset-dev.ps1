param(
  [switch]$StartDev
)

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$lockFile = Join-Path $workspaceRoot ".next\dev\lock"
$portsToCheck = @(3000, 3001)

Write-Host "Limpiando estado de Next.js dev en $workspaceRoot"

function Stop-WorkspaceProcess {
  param(
    [Parameter(Mandatory = $true)]
    [uint32]$ProcessId
  )

  if ($ProcessId -eq $PID) {
    return
  }

  $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
  if (-not $processInfo) {
    return
  }

  $commandLine = $processInfo.CommandLine
  if (-not $commandLine) {
    return
  }

  $isWorkspaceProcess = $commandLine -like "*$workspaceRoot*"
  $isDevProcess = $commandLine -like "*next dev*" -or $commandLine -like "*npm run dev*"

  if ($isWorkspaceProcess -and $isDevProcess) {
    Write-Host "Deteniendo PID $ProcessId"
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
  }
}

Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -and
    $_.CommandLine -like "*$workspaceRoot*" -and
    ($_.CommandLine -like "*next dev*" -or $_.CommandLine -like "*npm run dev*")
  } |
  ForEach-Object {
    Stop-WorkspaceProcess -ProcessId $_.ProcessId
  }

foreach ($port in $portsToCheck) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object {
      Stop-WorkspaceProcess -ProcessId $_
    }
}

Start-Sleep -Milliseconds 500

if (Test-Path $lockFile) {
  Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
  Write-Host "Lock eliminado: $lockFile"
}

if ($StartDev) {
  Write-Host "Iniciando npm run dev..."
  Push-Location $workspaceRoot
  try {
    & npm.cmd run dev
  }
  finally {
    Pop-Location
  }
}
