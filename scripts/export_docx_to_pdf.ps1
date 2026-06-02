param(
  [Parameter(Mandatory = $true)]
  [string]$DocxPath,

  [Parameter(Mandatory = $true)]
  [string]$PdfPath
)

$ErrorActionPreference = "Stop"

if (Get-Process WINWORD -ErrorAction SilentlyContinue) {
  Get-Process WINWORD -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 1
}

$word = $null
$document = $null

try {
  $parent = Split-Path -Parent $PdfPath
  if (-not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }

  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0

  $document = $word.Documents.Open($DocxPath, $false, $true, $false)
  $document.ExportAsFixedFormat(
    $PdfPath,
    17,
    $false,
    0,
    0,
    1,
    1,
    0,
    $true,
    $true,
    0,
    $true,
    $true,
    $false
  )

  Write-Output $PdfPath
}
finally {
  if ($document -ne $null) {
    $document.Close([ref]$false) | Out-Null
  }
  if ($word -ne $null) {
    $word.Quit() | Out-Null
  }
  [System.GC]::Collect()
  [System.GC]::WaitForPendingFinalizers()
}
