# OKX Trade MCP — one-line installer for Windows
# Usage: irm https://raw.githubusercontent.com/okx/agent-tradekit/master/scripts/install.ps1 | iex
#
# What it does:
#   1. Checks for Node.js >= 18
#   2. Installs @okx_ai/okx-trade-mcp and @okx_ai/okx-trade-cli globally via npm
#   3. Verifies the installation
#   4. Detects installed MCP clients and shows setup hints

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
$PACKAGES = @("@okx_ai/okx-trade-mcp", "@okx_ai/okx-trade-cli")
$MIN_NODE_VERSION = 18
$REPO_URL = "https://github.com/okx/agent-tradekit"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Write-Info  { param([string]$Msg) Write-Host "[info]  $Msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$Msg) Write-Host "[ok]    $Msg" -ForegroundColor Green }
function Write-Warn  { param([string]$Msg) Write-Host "[warn]  $Msg" -ForegroundColor Yellow }
function Write-Fail  { param([string]$Msg) Write-Host "[error] $Msg" -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------------------
# Step 1 — Check Node.js
# ---------------------------------------------------------------------------
function Test-Node {
    Write-Info "Checking Node.js ..."

    $nodePath = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodePath) {
        Write-Warn "Node.js is not installed."
        Write-Host ""
        Write-Host "  Install Node.js >= $MIN_NODE_VERSION using one of the following:"
        Write-Host ""
        Write-Host "    # Official installer (recommended)"
        Write-Host "    https://nodejs.org/"
        Write-Host ""
        Write-Host "    # winget"
        Write-Host "    winget install OpenJS.NodeJS.LTS"
        Write-Host ""
        Write-Host "    # scoop"
        Write-Host "    scoop install nodejs-lts"
        Write-Host ""
        Write-Host "    # chocolatey"
        Write-Host "    choco install nodejs-lts"
        Write-Host ""
        Write-Fail "Please install Node.js and re-run this script."
    }

    $nodeVersion = (node -v) -replace '^v', ''
    $major = [int]($nodeVersion -split '\.')[0]

    if ($major -lt $MIN_NODE_VERSION) {
        Write-Fail "Node.js v$nodeVersion found, but >= $MIN_NODE_VERSION is required. Please upgrade."
    }

    Write-Ok "Node.js v$nodeVersion"
}

# ---------------------------------------------------------------------------
# Step 2 — Check npm
# ---------------------------------------------------------------------------
function Test-Npm {
    $npmPath = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npmPath) {
        Write-Fail "npm is not found. It should come with Node.js. Please reinstall Node.js."
    }
    $npmVersion = npm -v
    Write-Ok "npm v$npmVersion"
}

# ---------------------------------------------------------------------------
# Step 3 — Install package
# ---------------------------------------------------------------------------
function Install-Package {
    $pkgList = $PACKAGES -join " "
    Write-Info "Installing $pkgList ..."

    try {
        npm install -g @PACKAGES
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
        Write-Ok "Installed $pkgList"
    }
    catch {
        Write-Host ""
        Write-Warn "Global install failed."
        Write-Host ""
        Write-Host "  Try running PowerShell as Administrator, or use:"
        Write-Host ""
        Write-Host "    npm install -g $pkgList"
        Write-Host ""
        Write-Fail "Installation failed. See above for solutions."
    }
}

# ---------------------------------------------------------------------------
# Step 4 — Verify
# ---------------------------------------------------------------------------
function Test-Install {
    Write-Info "Verifying installation ..."

    $mcpBin = Get-Command okx-trade-mcp -ErrorAction SilentlyContinue
    if ($mcpBin) {
        try {
            $version = (okx-trade-mcp --version 2>$null) | Select-Object -First 1
            Write-Ok "okx-trade-mcp $version"
        } catch {
            Write-Ok "okx-trade-mcp installed (version check skipped)"
        }
    } else {
        Write-Warn "okx-trade-mcp is not in PATH. You can still use it via: npx @okx_ai/okx-trade-mcp"
    }

    $cliBin = Get-Command okx -ErrorAction SilentlyContinue
    if ($cliBin) {
        try {
            $cliVersion = (okx -v 2>$null) | Select-Object -First 1
            Write-Ok "okx-trade-cli $cliVersion"
        } catch {
            Write-Ok "okx-trade-cli installed (version check skipped)"
        }
    } else {
        Write-Warn "okx (CLI) is not in PATH. You can still use it via: npx @okx_ai/okx-trade-cli"
    }
}

# ---------------------------------------------------------------------------
# Step 5 — Detect clients & show next steps
# ---------------------------------------------------------------------------
function Find-AndSetup-Clients {
    $detected = @()

    # Claude Desktop — standard install
    $claudeStandard = Join-Path $env:APPDATA "Claude"
    if (Test-Path $claudeStandard) { $detected += "claude-desktop" }

    # Claude Desktop — MS Store
    if (-not ($detected -contains "claude-desktop")) {
        $localAppData = $env:LOCALAPPDATA
        if ($localAppData) {
            $packagesDir = Join-Path $localAppData "Packages"
            if (Test-Path $packagesDir) {
                $claudePkg = Get-ChildItem $packagesDir -Directory -Filter "Claude_*" -ErrorAction SilentlyContinue | Select-Object -First 1
                if ($claudePkg) { $detected += "claude-desktop" }
            }
        }
    }

    # Cursor
    $cursorDir = Join-Path $env:USERPROFILE ".cursor"
    if (Test-Path $cursorDir) { $detected += "cursor" }

    # Windsurf
    $windsurfDir = Join-Path $env:USERPROFILE ".codeium\windsurf"
    if (Test-Path $windsurfDir) { $detected += "windsurf" }

    if ($detected.Count -eq 0) {
        Write-Info "No MCP clients detected. You can configure one later with:"
        Write-Host "    okx-trade-mcp setup --client <client>"
        return
    }

    Write-Host ""
    Write-Info "Detected MCP clients: $($detected -join ', ')"
    Write-Host ""

    # When piped (irm | iex), there is no interactive console — auto-configure
    $interactive = [Environment]::UserInteractive -and [Console]::KeyAvailable -ne $null
    $autoSetup = $true

    try {
        $answer = Read-Host "  Auto-configure these clients? (Y/n)"
        if (-not $answer) { $answer = "Y" }
        $autoSetup = $answer -match '^[Yy]$'
    }
    catch {
        # Non-interactive — auto-configure
        Write-Info "Non-interactive mode, auto-configuring all detected clients ..."
        $autoSetup = $true
    }

    if ($autoSetup) {
        foreach ($client in $detected) {
            try {
                okx-trade-mcp setup --client $client 2>$null
                if ($LASTEXITCODE -eq 0) {
                    Write-Ok "Configured $client"
                } else {
                    throw "exit code $LASTEXITCODE"
                }
            }
            catch {
                Write-Warn "Failed to configure $client. Run manually: okx-trade-mcp setup --client $client"
            }
        }
    }
    else {
        Write-Host ""
        Write-Host "  Skipped. Configure later with:"
        foreach ($client in $detected) {
            Write-Host "    okx-trade-mcp setup --client $client"
        }
    }
}

function Show-NextSteps {
    Write-Host ""
    Write-Host "------------------------------------------------------------"
    Write-Ok "Installation complete!"
    Write-Host ""
    Write-Host "  Next step - configure your API credentials:"
    Write-Host ""
    Write-Host "    okx config init"
    Write-Host ""
    Write-Host "  Documentation: $REPO_URL"
    Write-Host "------------------------------------------------------------"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "  OKX Trade MCP Installer"
Write-Host "  $REPO_URL"
Write-Host ""

Test-Node
Test-Npm
Install-Package
Test-Install
Find-AndSetup-Clients
Show-NextSteps
