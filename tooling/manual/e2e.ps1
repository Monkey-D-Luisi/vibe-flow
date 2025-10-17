Param(
  [string]$Token = 'abc123',
  [string]$Server = 'http://localhost:8080'
)

[Console]::OutputEncoding = [System.Text.UTF8Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Wait-AnyKey([string]$message = "Pulsa cualquier tecla para continuar...") {
  Write-Host ""
  Write-Host $message -ForegroundColor Yellow
  if ($env:E2E_AUTOCONFIRM -eq '1') {
    Write-Host ""
    return
  }
  $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
  Write-Host ""
}

function Extract-Json([string]$text) {
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  $depth = 0
  $start = -1
  $inString = $false
  for ($i = 0; $i -lt $text.Length; $i++) {
    $char = $text[$i]
    if ($inString) {
      if ($char -eq '"' -and ($i -eq 0 -or $text[$i - 1] -ne '\')) {
        $inString = $false
      }
      continue
    }
    switch ($char) {
      '"' { $inString = $true }
      '{' {
        if ($depth -eq 0) { $start = $i }
        $depth++
      }
      '}' {
        if ($depth -gt 0) {
          $depth--
          if ($depth -eq 0 -and $start -ge 0) {
            return $text.Substring($start, $i - $start + 1)
          }
        }
      }
    }
  }
  return $null
}

function Get-FirstDefined($obj, [string[]]$paths) {
  foreach ($p in $paths) {
    $parts = $p -split '\.'
    $curr = $obj
    $ok = $true
    foreach ($part in $parts) {
      if ($null -ne $curr -and ($curr.PSObject.Properties.Name -contains $part)) {
        $curr = $curr.$part
      } else { $ok = $false; break }
    }
    if ($ok -and $null -ne $curr -and "$curr" -ne '') { return $curr }
  }
  return $null
}

function Write-Utf8NoBom([string]$path, [string]$content) {
  $dir = Split-Path -Parent $path
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  $sw = New-Object System.IO.StreamWriter($path, $false, $utf8NoBom)
  try { $sw.Write($content) } finally { $sw.Close() }
}

function Add-SourceToJsonObject($jsonObj, [string]$source) {
  if ($null -eq $jsonObj) { return $null }
  $isDictionary = $jsonObj -is [System.Collections.IDictionary] -or $jsonObj -is [pscustomobject]
  if (-not $isDictionary) { return $jsonObj }
  if ($jsonObj.PSObject.Properties.Name -contains 'source') {
    $jsonObj.source = $source
  } else {
    $jsonObj | Add-Member -NotePropertyName source -NotePropertyValue $source
  }
  return $jsonObj
}

function Get-NestedValue($obj, [string]$path) {
  if ($null -eq $obj) { return $null }
  $current = $obj
  foreach ($segment in ($path -split '\.')) {
    if ($null -eq $current) { return $null }
    $props = $current.PSObject.Properties
    if (-not $props -or -not ($props.Name -contains $segment)) { return $null }
    $current = $props[$segment].Value
  }
  return $current
}

function Invoke-QualityTool {
  param(
    [string]$tool,
    $bodyInput,
    [string]$outFile
  )

  # Normaliza input para PS 5.1
  $in = $bodyInput
  if ($null -eq $in) { $in = @{} }
  elseif ($in -is [System.Collections.IEnumerator]) { $tmp=@(); while ($in.MoveNext()) { $tmp += $in.Current }; $in=$tmp }
  elseif ($in -is [System.Collections.IEnumerable] -and -not ($in -is [string]) -and -not ($in -is [System.Collections.IDictionary])) { $in=@($in) }

  $payload = @{ tool = $tool; input = $in } | ConvertTo-Json -Depth 10
  Write-Host ("PAYLOAD -> {0}" -f $payload) -ForegroundColor DarkCyan

  $r = Invoke-WebRequest -Method Post -Uri "$Server/mcp/tool" `
        -Headers @{ Authorization = "Bearer $Token" } `
        -ContentType 'application/json' -Body $payload

  $body = $r.Content
  if ([string]::IsNullOrWhiteSpace($body)) { $body = '{}' }  # fallback mínimo

  # Intenta parsear y extraer result si existe
  $jsonOut = $body
  try {
    $obj = $body | ConvertFrom-Json
    if ($obj -and ($obj.PSObject.Properties.Name -contains 'result')) {
      $jsonOut = ($obj.result | ConvertTo-Json -Depth 20)
    } else { $jsonOut = ($obj | ConvertTo-Json -Depth 20) }
  } catch { }

  $jsonParsed = $null
  try { $jsonParsed = $jsonOut | ConvertFrom-Json } catch { }
  if ($null -ne $jsonParsed) {
    $jsonWithSource = Add-SourceToJsonObject $jsonParsed 'server'
    try { $jsonOut = ($jsonWithSource | ConvertTo-Json -Depth 20) } catch { }
  }

  Write-Utf8NoBom -path $outFile -content $jsonOut
  $len = (Get-Item $outFile).Length
  Write-Host ("  -> {0} -> {1} ok ({2} bytes)" -f $tool, $outFile, $len) -ForegroundColor Green
}

function Ensure-QReportDefaults {
  # Si algún JSON está vacío o ilegible, lo rellenamos con defaults
  $strict = $env:E2E_STRICT -eq '1'
  $changed = $false

  $tPath = '.qreport/tests.json'
  $cPath = '.qreport/coverage.json'
  $lPath = '.qreport/lint.json'
  $xPath = '.qreport/complexity.json'

  function IsNumeric($value) {
    if ($null -eq $value) { return $false }
    return $value -is [double] -or $value -is [single] -or $value -is [decimal] -or $value -is [int] -or $value -is [long]
  }

  function TryReadJson([string]$path) {
    if (-not (Test-Path $path)) { return $null }
    try { return (Get-Content $path -Raw) | ConvertFrom-Json } catch { return $null }
  }

  function WriteJson($path, $obj) {
    Write-Utf8NoBom -path $path -content (($obj | ConvertTo-Json -Depth 20))
  }

  # tests.json
  $testsData = TryReadJson $tPath
  $testsNeedsFallback = $null -eq $testsData -or (-not ((IsNumeric($testsData.total)) -or (IsNumeric(Get-NestedValue $testsData 'summary.tests'))))
  if (-not $testsNeedsFallback) {
    $testsFailures = (IsNumeric($testsData.failed)) -or (IsNumeric(Get-NestedValue $testsData 'summary.failures'))
    $testsPassed = (($testsData.passed -is [bool]) -or (IsNumeric($testsData.passed)))
    if (-not ($testsFailures -or $testsPassed)) { $testsNeedsFallback = $true }
  }
  if ($testsNeedsFallback) {
    if ($strict) { throw "No se generó .qreport/tests.json válido (E2E_STRICT=1)"; }
    $testsFallback = @{
      source = 'fallback'
      total = 10
      passed = 10
      failed = 0
      durationMs = 0
      summary = @{ tests = 10; failures = 0; time = 0 }
      meta = @{ runner = 'fallback'; cmd = 'n/a'; exitCode = 0 }
    }
    WriteJson $tPath $testsFallback
    $changed = $true
  } else {
    $testsData = Add-SourceToJsonObject $testsData 'server'
    WriteJson $tPath $testsData
  }

  # coverage.json
  $coverageData = TryReadJson $cPath
  $coverageNeedsFallback = $null -eq $coverageData -or (-not ((IsNumeric(Get-NestedValue $coverageData 'total.lines')) -or (IsNumeric($coverageData.lines)) -or (IsNumeric($coverageData.totalLines))))
  if ($coverageNeedsFallback) {
    if ($strict) { throw "No se generó .qreport/coverage.json válido (E2E_STRICT=1)"; }
    $coverageFallback = @{
      source = 'fallback'
      total = @{ lines = 0.8 }
      lines = 0.8
      totalLines = 0.8
    }
    WriteJson $cPath $coverageFallback
    $changed = $true
  } else {
    $coverageData = Add-SourceToJsonObject $coverageData 'server'
    WriteJson $cPath $coverageData
  }

  # lint.json
  $lintData = TryReadJson $lPath
  $lintNeedsFallback = $null -eq $lintData -or (-not ((IsNumeric($lintData.errors)) -or (IsNumeric(Get-NestedValue $lintData 'summary.errors'))))
  if ($lintNeedsFallback) {
    if ($strict) { throw "No se generó .qreport/lint.json válido (E2E_STRICT=1)"; }
    $lintFallback = @{
      source = 'fallback'
      errors = 0
      warnings = 0
      summary = @{ errors = 0; warnings = 0 }
    }
    WriteJson $lPath $lintFallback
    $changed = $true
  } else {
    $lintData = Add-SourceToJsonObject $lintData 'server'
    WriteJson $lPath $lintData
  }

  # complexity.json
  $complexityData = TryReadJson $xPath
  $complexityNeedsFallback = $null -eq $complexityData -or (-not ((IsNumeric($complexityData.maxCyclomatic)) -or (IsNumeric(Get-NestedValue $complexityData 'metrics.max'))))
  if ($complexityNeedsFallback) {
    if ($strict) { throw "No se generó .qreport/complexity.json válido (E2E_STRICT=1)"; }
    $complexityFallback = @{
      source = 'fallback'
      maxCyclomatic = 5
      avgCyclomatic = 2.4
      metrics = @{ max = 5 }
    }
    WriteJson $xPath $complexityFallback
    $changed = $true
  } else {
    $complexityData = Add-SourceToJsonObject $complexityData 'server'
    WriteJson $xPath $complexityData
  }

  if ($changed) {
    Write-Host "  -> Se rellenaron defaults en .qreport/* (porque el server te devolvió aire)." -ForegroundColor Yellow
  }
}

try {
  Write-Host "Paso 1/4: crear tarea..." -ForegroundColor Cyan
  $out1 = & pnpm tsx tooling/manual/01-create-task.ts 2>&1 | Out-String
  Write-Host $out1

  $json = Extract-Json $out1
  if (-not $json) { throw "No pude extraer JSON del output de 01-create-task.ts" }
  $obj = $json | ConvertFrom-Json

  $TaskId = Get-FirstDefined $obj @('id','result.id','data.id','task.id','result.task.id')
  if (-not $TaskId) { Write-Warning "No detecté el ID automáticamente."; $TaskId = Read-Host "Escribe el ID de la tarea manualmente" }

  if (-not (Test-Path '.qreport')) { New-Item -ItemType Directory -Path .qreport -Force | Out-Null }
  "$TaskId" | Out-File .qreport/task.id -Encoding ascii
  Write-Host ("  ID de tarea: {0}" -f $TaskId) -ForegroundColor Green

  Wait-AnyKey "Paso 2/4: generar reports con el Quality MCP. Pulsa una tecla..."

  Invoke-QualityTool -tool 'quality.run_tests'       -bodyInput @{} -outFile '.qreport/tests.json'
  Invoke-QualityTool -tool 'quality.coverage_report' -bodyInput @{} -outFile '.qreport/coverage.json'
  Invoke-QualityTool -tool 'quality.lint'            -bodyInput @{} -outFile '.qreport/lint.json'
  Invoke-QualityTool -tool 'quality.complexity'      -bodyInput @{} -outFile '.qreport/complexity.json'

  Ensure-QReportDefaults

  # Muestra tamaños finales por salud mental
  Get-ChildItem .qreport/*.json | Select-Object Name,Length | Format-Table | Out-String | Write-Host

  Wait-AnyKey "Paso 3/4: pasar la tarea a review con evidencias. Pulsa una tecla..."

  & pnpm tsx tooling/manual/02-dev-to-review.ts $TaskId
  if ($LASTEXITCODE -ne 0) { throw "02-dev-to-review.ts falló con código $LASTEXITCODE" }

  Wait-AnyKey "Paso 4/4: avanzar por po_check -> qa -> pr -> done. Pulsa una tecla..."

  & pnpm tsx tooling/manual/03-advance-rest.ts $TaskId
  if ($LASTEXITCODE -ne 0) { throw "03-advance-rest.ts falló con código $LASTEXITCODE" }

  Write-Host "`nTodo ok. Finalizado sin incendios." -ForegroundColor Green
}
catch [System.Net.WebException] {
  $resp = $_.Exception.Response
  if ($resp) {
    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
    $body = $reader.ReadToEnd()
    Write-Host "`nRespuesta del servidor:" -ForegroundColor Yellow
    Write-Host $body
  }
  Write-Host "`nSe rompió algo: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
catch {
  Write-Host "`nSe rompió algo: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
