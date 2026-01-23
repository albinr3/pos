# Load variables from .env
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $name, $value = $_ -split '=', 2
  Set-Item -Path ("Env:" + $name) -Value $value
}

if (-not $env:DATABASE_URL_PROD) {
  Write-Error "DATABASE_URL_PROD no está configurada en .env"
  exit 1
}

# Override Prisma connection for production
$env:DATABASE_URL = $env:DATABASE_URL_PROD

npx prisma migrate deploy
