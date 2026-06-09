# Valida las migraciones SQL aplicándolas en un Postgres efímero (Docker).
# Reproduce el entorno Supabase con _supabase_stub.sql. No toca tu proyecto real.
#
# Uso:  pwsh supabase/test/validate.ps1
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$migrations = Join-Path $here '..\migrations'
$container = 'polla_pg_test'

Write-Host '== Levantando Postgres efímero ==' -ForegroundColor Cyan
docker rm -f $container *> $null
docker run -d --name $container -e POSTGRES_PASSWORD=test -e POSTGRES_DB=polla postgres:16-alpine *> $null

for ($i = 0; $i -lt 40; $i++) {
  docker exec $container pg_isready -U postgres *> $null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 1
}
Write-Host 'Postgres listo.' -ForegroundColor Green

function Invoke-Sql($file) {
  Write-Host "-> $([System.IO.Path]::GetFileName($file))" -ForegroundColor Yellow
  Get-Content -Raw $file | docker exec -i $container psql -U postgres -d polla -v ON_ERROR_STOP=1 -q
  if ($LASTEXITCODE -ne 0) { throw "FALLO en $file" }
}

try {
  Invoke-Sql (Join-Path $here '_supabase_stub.sql')
  Get-ChildItem $migrations -Filter '*.sql' | Sort-Object Name | ForEach-Object { Invoke-Sql $_.FullName }
  Invoke-Sql (Join-Path $here '_supabase_grants.sql')
  Write-Host "`n== Migraciones OK. Ejecutando tests de seguridad RLS ==" -ForegroundColor Cyan
  Get-Content -Raw (Join-Path $here 'rls_security.sql') |
    docker exec -i $container psql -U postgres -d polla -q
  if ($LASTEXITCODE -ne 0) { throw 'FALLO en los tests RLS' }
  Write-Host "`n== Todo aplicó y los tests de seguridad pasaron ✅ ==" -ForegroundColor Green
}
finally {
  docker rm -f $container *> $null
}
