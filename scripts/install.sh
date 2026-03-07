#!/usr/bin/env bash
# OKX Trade MCP — one-line installer
# Usage: curl -fsSL https://raw.githubusercontent.com/okx/agent-tradekit/master/scripts/install.sh | bash
#
# What it does:
#   1. Checks for Node.js >= 18
#   2. Installs @okx_ai/okx-trade-mcp globally via npm
#   3. Verifies the installation
#   4. Detects installed MCP clients and shows setup hints

set -euo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
PACKAGE="@okx_ai/okx-trade-mcp"
MIN_NODE_VERSION=18
REPO_URL="https://github.com/okx/agent-tradekit"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
info()  { printf '\033[1;34m[info]\033[0m  %s\n' "$*"; }
ok()    { printf '\033[1;32m[ok]\033[0m    %s\n' "$*"; }
warn()  { printf '\033[1;33m[warn]\033[0m  %s\n' "$*"; }
fail()  { printf '\033[1;31m[error]\033[0m %s\n' "$*"; exit 1; }

# ---------------------------------------------------------------------------
# Step 1 — Check Node.js
# ---------------------------------------------------------------------------
check_node() {
  info "Checking Node.js ..."

  if ! command -v node &>/dev/null; then
    warn "Node.js is not installed."
    echo ""
    echo "  Install Node.js >= ${MIN_NODE_VERSION} using one of the following:"
    echo ""
    echo "    # nvm (recommended)"
    echo "    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash"
    echo "    nvm install --lts"
    echo ""
    echo "    # macOS (Homebrew)"
    echo "    brew install node"
    echo ""
    echo "    # Official installer"
    echo "    https://nodejs.org/"
    echo ""
    fail "Please install Node.js and re-run this script."
  fi

  local node_version
  node_version="$(node -v | sed 's/^v//')"
  local major
  major="$(echo "${node_version}" | cut -d. -f1)"

  if [ "${major}" -lt "${MIN_NODE_VERSION}" ]; then
    fail "Node.js v${node_version} found, but >= ${MIN_NODE_VERSION} is required. Please upgrade."
  fi

  ok "Node.js v${node_version}"
}

# ---------------------------------------------------------------------------
# Step 2 — Check npm
# ---------------------------------------------------------------------------
check_npm() {
  if ! command -v npm &>/dev/null; then
    fail "npm is not found. It should come with Node.js. Please reinstall Node.js."
  fi
  ok "npm v$(npm -v)"
}

# ---------------------------------------------------------------------------
# Step 3 — Install package
# ---------------------------------------------------------------------------
install_package() {
  info "Installing ${PACKAGE} ..."

  if npm install -g "${PACKAGE}"; then
    ok "Installed ${PACKAGE}"
  else
    echo ""
    warn "Global install failed. This usually means a permission issue."
    echo ""
    echo "  Try one of the following:"
    echo ""
    echo "    # Option 1: Use sudo (not recommended with nvm)"
    echo "    sudo npm install -g ${PACKAGE}"
    echo ""
    echo "    # Option 2: Fix npm prefix (recommended)"
    echo "    mkdir -p ~/.npm-global"
    echo "    npm config set prefix '~/.npm-global'"
    echo "    echo 'export PATH=~/.npm-global/bin:\$PATH' >> ~/.bashrc"
    echo "    source ~/.bashrc"
    echo "    npm install -g ${PACKAGE}"
    echo ""
    fail "Installation failed. See above for solutions."
  fi
}

# ---------------------------------------------------------------------------
# Step 4 — Verify
# ---------------------------------------------------------------------------
verify_install() {
  info "Verifying installation ..."

  if ! command -v okx-trade-mcp &>/dev/null; then
    warn "okx-trade-mcp is not in PATH."
    echo ""
    echo "  The package installed successfully, but the binary is not in your PATH."
    echo "  You can still use it via: npx ${PACKAGE}"
    echo ""
    return
  fi

  local version
  version="$(okx-trade-mcp --version 2>/dev/null || echo 'unknown')"
  ok "okx-trade-mcp v${version}"
}

# ---------------------------------------------------------------------------
# Step 5 — Detect clients & show next steps
# ---------------------------------------------------------------------------
detect_clients() {
  local home="${HOME:-}"
  [ -z "${home}" ] && return

  local detected=()

  # Claude Desktop
  local claude_path=""
  if [ "$(uname)" = "Darwin" ]; then
    claude_path="${home}/Library/Application Support/Claude"
  else
    claude_path="${XDG_CONFIG_HOME:-${home}/.config}/Claude"
  fi
  [ -d "${claude_path}" ] && detected+=("claude-desktop")

  # Cursor
  [ -d "${home}/.cursor" ] && detected+=("cursor")

  # Windsurf
  [ -d "${home}/.codeium/windsurf" ] && detected+=("windsurf")

  if [ ${#detected[@]} -gt 0 ]; then
    echo ""
    info "Detected MCP clients: ${detected[*]}"
    echo ""
    echo "  Configure with:"
    for client in "${detected[@]}"; do
      echo "    okx-trade-mcp setup --client ${client}"
    done
  fi
}

show_next_steps() {
  echo ""
  echo "------------------------------------------------------------"
  ok "Installation complete!"
  echo ""
  echo "  Quick start:"
  echo ""
  echo "    # 1. Initialize your API credentials"
  echo "    npx @okx_ai/okx-trade-cli config init"
  echo ""
  echo "    # 2. Set up your MCP client"
  echo "    okx-trade-mcp setup --client claude-desktop"
  echo ""
  echo "  Documentation: ${REPO_URL}"
  echo "------------------------------------------------------------"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  echo ""
  echo "  OKX Trade MCP Installer"
  echo "  ${REPO_URL}"
  echo ""

  check_node
  check_npm
  install_package
  verify_install
  detect_clients
  show_next_steps
}

main
