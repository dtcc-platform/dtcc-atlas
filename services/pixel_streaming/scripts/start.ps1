param(
    [string]$ConfigFile
)

$ErrorActionPreference = "Stop"

$moduleDir = Split-Path -Parent $PSScriptRoot
$psRoot = Join-Path $moduleDir "PixelStreamingInfrastructure"
$pidFile = Join-Path $moduleDir "temp/pixel_streaming.pids"
$logDir = Join-Path $moduleDir "temp/pixel_streaming_logs"

if (-not $ConfigFile -or $ConfigFile.Trim().Length -eq 0) {
    if ($env:PIXEL_STREAMING_CONFIG_FILE) {
        $ConfigFile = $env:PIXEL_STREAMING_CONFIG_FILE
    } else {
        $ConfigFile = Join-Path $moduleDir "config.env"
    }
}

function Set-EnvIfMissing {
    param([string]$Key, [string]$Value)
    if (-not (Test-Path "env:$Key")) {
        $env:$Key = $Value
    }
}

if (Test-Path $ConfigFile) {
    Get-Content $ConfigFile | ForEach-Object {
        $line = $_.Trim()
        if ($line.Length -eq 0 -or $line.StartsWith("#")) {
            return
        }
        $parts = $line.Split("=", 2)
        if ($parts.Count -lt 2) {
            return
        }
        $key = $parts[0].Trim()
        $value = $parts[1].Trim()
        if ($key.Length -gt 0) {
            Set-EnvIfMissing -Key $key -Value $value
        }
    }
}

Set-EnvIfMissing -Key "PIXEL_STREAMING_TURN_ENABLE" -Value "0"
Set-EnvIfMissing -Key "PIXEL_STREAMING_SFU_ENABLE" -Value "0"
Set-EnvIfMissing -Key "PIXEL_STREAMING_NO_SUDO" -Value "1"

if (-not (Test-Path $psRoot)) {
    Write-Error "PixelStreamingInfrastructure not found at $psRoot. Run git submodule update --init --recursive."
}

New-Item -ItemType Directory -Force (Join-Path $moduleDir "temp") | Out-Null
New-Item -ItemType Directory -Force $logDir | Out-Null
Set-Content -Path $pidFile -Value ""

$scheme = "ws"
$host = "localhost"
$playerPort = 8888

if ($env:PIXEL_STREAMING_SIGNALING_URL) {
    try {
        $uri = [Uri]$env:PIXEL_STREAMING_SIGNALING_URL
        $scheme = $uri.Scheme
        $host = $uri.Host
        if ($uri.IsDefaultPort) {
            $playerPort = if ($scheme -eq "wss") { 443 } else { 80 }
        } else {
            $playerPort = $uri.Port
        }
    } catch {
        Write-Error "Invalid PIXEL_STREAMING_SIGNALING_URL: $($env:PIXEL_STREAMING_SIGNALING_URL)"
    }
}

$streamerPort = if ($env:PIXEL_STREAMING_STREAMER_PORT) { [int]$env:PIXEL_STREAMING_STREAMER_PORT } else { $playerPort + 1 }
$sfuPort = if ($env:PIXEL_STREAMING_SFU_PORT) { [int]$env:PIXEL_STREAMING_SFU_PORT } else { $playerPort + 2 }

$playerUrl = "$scheme://$host`:$playerPort"
$sfuSignalingUrl = "$scheme://$host`:$sfuPort"

Write-Host "Starting Pixel Streaming services..."
Write-Host "  Player URL     : $playerUrl"
Write-Host "  Player port    : $playerPort"
Write-Host "  Streamer port  : $streamerPort"
if ($env:PIXEL_STREAMING_SFU_ENABLE -eq "1") {
    Write-Host "  SFU port       : $sfuPort"
} else {
    Write-Host "  SFU            : disabled"
}
Write-Host "  TURN enabled   : $($env:PIXEL_STREAMING_TURN_ENABLE)"

$signallingScript = Join-Path $psRoot "SignallingWebServer/platform_scripts/cmd/start.bat"
$signallingTurnScript = Join-Path $psRoot "SignallingWebServer/platform_scripts/cmd/start_with_turn.bat"
$sfuScript = Join-Path $psRoot "SFU/platform_scripts/cmd/run_local.bat"

$signallingArgs = @("--", "--player_port", $playerPort, "--streamer_port", $streamerPort, "--sfu_port", $sfuPort, "--log_folder", $logDir)
$signallingArgsString = ($signallingArgs | ForEach-Object {
    if ($_ -match "\s") { '"' + $_ + '"' } else { $_ }
}) -join " "

$signallingWorkingDir = Join-Path $psRoot "SignallingWebServer"
$sfuWorkingDir = Join-Path $psRoot "SFU"

if ($env:PIXEL_STREAMING_TURN_ENABLE -eq "1") {
    $signallingProcess = Start-Process -FilePath $signallingTurnScript -ArgumentList $signallingArgsString -WorkingDirectory $signallingWorkingDir -PassThru
} else {
    $signallingProcess = Start-Process -FilePath $signallingScript -ArgumentList $signallingArgsString -WorkingDirectory $signallingWorkingDir -PassThru
}

Add-Content -Path $pidFile -Value "$($signallingProcess.Id):signalling"

if ($env:PIXEL_STREAMING_SFU_ENABLE -eq "1") {
    $sfuArgs = @("--signallingURL=$sfuSignalingUrl")
    $sfuProcess = Start-Process -FilePath $sfuScript -ArgumentList $sfuArgs -WorkingDirectory $sfuWorkingDir -PassThru
    Add-Content -Path $pidFile -Value "$($sfuProcess.Id):sfu"
}

Write-Host "Pixel Streaming processes started. PID file: $pidFile"
