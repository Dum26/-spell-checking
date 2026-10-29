param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$logRoot = Join-Path $appRoot '.cache'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null

function Test-Endpoint([string]$Url) {
    try { Invoke-RestMethod -Uri $Url -TimeoutSec 2 | Out-Null; return $true }
    catch { return $false }
}

try {
    if (-not (Test-Endpoint 'http://127.0.0.1:11434/api/version')) {
        $ollamaExe = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
        if (-not (Test-Path -LiteralPath $ollamaExe)) { $ollamaExe = (Get-Command ollama -ErrorAction Stop).Source }
        $env:OLLAMA_HOST = '127.0.0.1:11434'
        $env:OLLAMA_NO_CLOUD = '1'
        $env:OLLAMA_NUM_PARALLEL = '1'
        $env:OLLAMA_MAX_LOADED_MODELS = '1'
        Start-Process -FilePath $ollamaExe -ArgumentList 'serve' -WindowStyle Hidden -WorkingDirectory $appRoot -RedirectStandardOutput (Join-Path $logRoot 'ollama-out.log') -RedirectStandardError (Join-Path $logRoot 'ollama-error.log')
        $deadline = (Get-Date).AddSeconds(30)
        while (-not (Test-Endpoint 'http://127.0.0.1:11434/api/version')) {
            if ((Get-Date) -gt $deadline) { throw 'Ollama could not start. See .cache/ollama-error.log.' }
            Start-Sleep -Milliseconds 500
        }
    }
    if (-not (Test-Endpoint 'http://127.0.0.1:4173/')) {
        $nodeExe = (Get-Command node -ErrorAction Stop).Source
        $env:HOST = '127.0.0.1'
        $env:PORT = '4173'
        Start-Process -FilePath $nodeExe -ArgumentList 'server.js' -WindowStyle Hidden -WorkingDirectory $appRoot -RedirectStandardOutput (Join-Path $logRoot 'web-out.log') -RedirectStandardError (Join-Path $logRoot 'web-error.log')
        $deadline = (Get-Date).AddSeconds(15)
        while (-not (Test-Endpoint 'http://127.0.0.1:4173/')) {
            if ((Get-Date) -gt $deadline) { throw 'Web server could not start. See .cache/web-error.log.' }
            Start-Sleep -Milliseconds 500
        }
    }
    $deadline = (Get-Date).AddSeconds(330)
    do {
        $modelState = Invoke-RestMethod -Uri 'http://127.0.0.1:4173/api/models' -TimeoutSec 3
        if ($modelState.status -ne 'loading') { break }
        if ((Get-Date) -gt $deadline) { throw 'Models are still loading. See .cache/web-error.log.' }
        Start-Sleep -Milliseconds 500
    } while ($true)
    $modelState | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $logRoot 'model-status.json')
    if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:4173/' }
} catch {
    $_ | Out-String | Set-Content -Encoding UTF8 (Join-Path $logRoot 'start-error.log')
    if (-not $NoBrowser) {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'MECSU') | Out-Null
    }
    exit 1
}
