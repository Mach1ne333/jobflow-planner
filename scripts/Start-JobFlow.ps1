# Start JobFlow in its project folder, or reuse an existing instance.
# Keep the terminal opened by this script running while you use JobFlow.
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$url = 'http://127.0.0.1:5173/'
$port = 5173

function Test-JobFlow {
    try {
        $page = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        return ($page.StatusCode -eq 200 -and $page.Content -match '<title>JobFlow' -and $page.Content -match '/src/main.tsx')
    } catch { return $false }
}

function Test-PortInUse {
    return [bool](Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

try {
    if (Test-JobFlow) {
        Write-Host 'JobFlow is already running. Opening the browser...'
        Start-Process $url
        exit 0
    }
    if (Test-PortInUse) {
        throw 'Port 5173 is occupied by another program. Close it before starting JobFlow.'
    }
    if (-not (Test-Path (Join-Path $project 'node_modules\vite\bin\vite.js'))) {
        throw "Dependencies are missing. Open PowerShell in $project and run: npm install"
    }
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw 'npm.cmd was not found on PATH. Install Node.js or add it to PATH.'
    }

    # A separate console is intentional: closing it stops the local web server.
    $args = '/k "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort"'
    Start-Process -FilePath $env:ComSpec -ArgumentList $args -WorkingDirectory $project | Out-Null
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        Start-Sleep -Milliseconds 500
        if (Test-JobFlow) {
            Start-Process $url
            exit 0
        }
        if (Test-PortInUse -and $attempt -gt 5) {
            throw 'Port 5173 is occupied, but the page is not JobFlow. Check the server window.'
        }
    }
    throw 'JobFlow did not start within 20 seconds. Check the server window for errors.'
} catch {
    Write-Host "JobFlow start failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
