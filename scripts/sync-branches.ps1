param(
  [Parameter(Mandatory = $true)]
  [string]$SourceBranch,
  [Parameter(Mandatory = $true)]
  [string]$TargetBranch,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Invoke-Git {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Args,
    [switch]$AllowFailure
  )

  $output = & git @Args 2>&1
  $exitCode = $LASTEXITCODE

  if (-not $AllowFailure -and $exitCode -ne 0) {
    throw "git $($Args -join ' ')`n$output"
  }

  return [PSCustomObject]@{
    ExitCode = $exitCode
    Output   = $output
  }
}

try {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git no esta instalado o no esta disponible en PATH."
  }

  $insideWorkTree = (Invoke-Git -Args @("rev-parse", "--is-inside-work-tree")).Output
  if ($insideWorkTree -notcontains "true") {
    throw "Debes ejecutar este script dentro de un repositorio Git."
  }

  if ($SourceBranch -eq $TargetBranch) {
    throw "La rama origen y destino no pueden ser la misma."
  }

  $status = (Invoke-Git -Args @("status", "--porcelain")).Output
  if ($status.Count -gt 0) {
    throw "Hay cambios locales sin commit. Haz commit/stash antes de sincronizar."
  }

  Write-Host "Actualizando referencias remotas..."
  Invoke-Git -Args @("fetch", "origin") | Out-Null

  foreach ($branch in @($SourceBranch, $TargetBranch)) {
    $hasLocal = (Invoke-Git -Args @("show-ref", "--verify", "--quiet", "refs/heads/$branch") -AllowFailure).ExitCode -eq 0
    $hasRemote = (Invoke-Git -Args @("ls-remote", "--heads", "origin", $branch) -AllowFailure).Output

    if (-not $hasLocal -and [string]::IsNullOrWhiteSpace(($hasRemote -join ""))) {
      throw "La rama '$branch' no existe ni local ni en origin."
    }
  }

  if ($DryRun) {
    Write-Host "[DRY RUN] Se sincronizaria '$SourceBranch' -> '$TargetBranch'."
    exit 0
  }

  Write-Host "Cambiando a rama destino '$TargetBranch'..."
  Invoke-Git -Args @("checkout", $TargetBranch) | Out-Null

  Write-Host "Actualizando '$TargetBranch' desde origin con fast-forward..."
  Invoke-Git -Args @("pull", "--ff-only", "origin", $TargetBranch) | Out-Null

  Write-Host "Intentando merge de 'origin/$SourceBranch' en '$TargetBranch'..."
  $mergeResult = Invoke-Git -Args @("merge", "--no-ff", "origin/$SourceBranch") -AllowFailure

  if ($mergeResult.ExitCode -ne 0) {
    $hasConflicts = (Invoke-Git -Args @("diff", "--name-only", "--diff-filter=U") -AllowFailure).Output
    if ($hasConflicts.Count -gt 0) {
      Write-Error "Conflictos detectados. Se detuvo el proceso y no se hizo push."
      Write-Host "Archivos en conflicto:"
      $hasConflicts | ForEach-Object { Write-Host " - $_" }
      Write-Host "Resuelve conflictos y luego ejecuta 'git commit' y 'git push origin $TargetBranch'."
      exit 1
    }

    throw "Fallo el merge sin archivos en conflicto detectados.`n$($mergeResult.Output -join [Environment]::NewLine)"
  }

  Write-Host "Merge completado. Haciendo push a origin/$TargetBranch..."
  Invoke-Git -Args @("push", "origin", $TargetBranch) | Out-Null

  Write-Host "Sincronizacion completada: '$SourceBranch' -> '$TargetBranch'."
  exit 0
}
catch {
  Write-Error $_.Exception.Message
  exit 1
}
