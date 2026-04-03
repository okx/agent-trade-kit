#!/usr/bin/env bash
# OKX Trade MCP — one-line installer
# Usage: curl -fsSL https://raw.githubusercontent.com/okx/agent-tradekit/master/scripts/install.sh | bash
#
# What it does:
#   1. Checks for Node.js >= 18
#   2. Installs @okx_ai/okx-trade-mcp and @okx_ai/okx-trade-cli globally via npm
#   3. Verifies the installation
#   4. Detects installed MCP clients and shows setup hints

set -euo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
PACKAGES="@okx_ai/okx-trade-mcp @okx_ai/okx-trade-cli"
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
# Step 3 — Check if already up to date (skip install if so)
# ---------------------------------------------------------------------------
SKIP_INSTALL=false

check_version() {
  local latest
  latest=$(npm view @okx_ai/okx-trade-cli version 2>/dev/null) || return 0
  [ -z "${latest}" ] && return 0

  local local_ver
  local_ver=$(okx --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?' | head -1 || true)

  if [ -n "${local_ver}" ] && [ "${latest}" = "${local_ver}" ]; then
    ok "Already up to date: ${local_ver}"
    SKIP_INSTALL=true
    return 0
  fi

  if [ -n "${local_ver}" ]; then
    info "Upgrading ${local_ver} → ${latest}"
  fi
}

# ---------------------------------------------------------------------------
# Step 4 — Install package
# ---------------------------------------------------------------------------
install_package() {
  if [ "${SKIP_INSTALL}" = "true" ]; then
    return
  fi

  info "Installing ${PACKAGES} ..."

  # shellcheck disable=SC2086
  if npm install -g ${PACKAGES}; then
    ok "Installed ${PACKAGES}"
  else
    echo ""
    warn "Global install failed. This usually means a permission issue."
    echo ""
    echo "  Try one of the following:"
    echo ""
    echo "    # Option 1: Use sudo (not recommended with nvm)"
    echo "    sudo npm install -g ${PACKAGES}"
    echo ""
    echo "    # Option 2: Fix npm prefix (recommended)"
    echo "    mkdir -p ~/.npm-global"
    echo "    npm config set prefix '~/.npm-global'"
    echo "    echo 'export PATH=~/.npm-global/bin:\$PATH' >> ~/.bashrc"
    echo "    source ~/.bashrc"
    echo "    npm install -g ${PACKAGES}"
    echo ""
    fail "Installation failed. See above for solutions."
  fi
}

# ---------------------------------------------------------------------------
# Step 5 — Verify
# ---------------------------------------------------------------------------
verify_install() {
  info "Verifying installation ..."

  local all_ok=true

  if command -v okx-trade-mcp &>/dev/null; then
    local mcp_ver
    mcp_ver="$(okx-trade-mcp --version 2>/dev/null | head -1 || echo 'unknown')"
    ok "okx-trade-mcp ${mcp_ver}"
  else
    warn "okx-trade-mcp is not in PATH. You can still use it via: npx @okx_ai/okx-trade-mcp"
    all_ok=false
  fi

  if command -v okx &>/dev/null; then
    local cli_ver
    cli_ver="$(okx -v 2>/dev/null | head -1 || echo 'unknown')"
    ok "okx-trade-cli ${cli_ver}"
  else
    warn "okx (CLI) is not in PATH. You can still use it via: npx @okx_ai/okx-trade-cli"
    all_ok=false
  fi

  if [ "${all_ok}" = false ]; then
    echo ""
    echo "  Binaries installed but not in PATH. This is common with nvm."
    echo "  Try opening a new terminal or run: source ~/.bashrc"
  fi
}

# ---------------------------------------------------------------------------
# Step 6 — Detect clients & show next steps
# ---------------------------------------------------------------------------
detect_and_setup_clients() {
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

  if [ ${#detected[@]} -eq 0 ]; then
    info "No MCP clients detected. You can configure one later with:"
    echo "    okx-trade-mcp setup --client <client>"
    return
  fi

  echo ""
  info "Detected MCP clients: ${detected[*]}"

  # When piped (curl | bash), stdin is the script itself — skip interactive prompt
  if [ ! -t 0 ]; then
    echo ""
    info "Running in non-interactive mode, auto-configuring all detected clients ..."
    for client in "${detected[@]}"; do
      if okx-trade-mcp setup --client "${client}" 2>/dev/null; then
        ok "Configured ${client}"
      else
        warn "Failed to configure ${client}. Run manually: okx-trade-mcp setup --client ${client}"
      fi
    done
    return
  fi

  echo ""
  printf "  Auto-configure these clients? (Y/n): "
  read -r answer </dev/tty
  answer="${answer:-Y}"

  if [[ "${answer}" =~ ^[Yy]$ ]]; then
    for client in "${detected[@]}"; do
      if okx-trade-mcp setup --client "${client}" 2>/dev/null; then
        ok "Configured ${client}"
      else
        warn "Failed to configure ${client}. Run manually: okx-trade-mcp setup --client ${client}"
      fi
    done
  else
    echo ""
    echo "  Skipped. Configure later with:"
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
  echo "  Next step — configure your API credentials:"
  echo ""
  echo "    okx config init"
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
  check_version
  install_package
  verify_install
  detect_and_setup_clients
  show_next_steps
}

main
