#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ROS2 Docker Generator CLI — Installer
#
# Usage (from inside the cloned repo):
#   ./install.sh
#
# Usage (remote, once published to npm):
#   curl -fsSL https://raw.githubusercontent.com/YOUR_USER/ros2-docker-gen/main/install.sh | bash
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PACKAGE_NAME="ros2-docker-gen"
MIN_NODE_MAJOR=18

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}[ros2-docker-gen]${RESET} $*"; }
success() { echo -e "${GREEN}[ros2-docker-gen]${RESET} $*"; }
warn()    { echo -e "${RED}[ros2-docker-gen] WARN:${RESET} $*"; }
die()     { echo -e "${RED}[ros2-docker-gen] ERROR:${RESET} $*" >&2; exit 1; }

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}║       🤖  ROS2 Docker Generator — Installer          ║${RESET}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""

# ── 1. Locate the repo root ───────────────────────────────────────────────────
# BASH_SOURCE[0] is the script path when run as ./install.sh or bash install.sh.
# When piped from curl it is unset/empty — we detect that and skip local install.
SCRIPT_DIR=""
LOCAL_INSTALL=false

if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

if [[ -n "${SCRIPT_DIR}" && -f "${SCRIPT_DIR}/package.json" && -f "${SCRIPT_DIR}/bin/cli.js" ]]; then
    LOCAL_INSTALL=true
    info "Detected local repo at: ${SCRIPT_DIR}"
fi

# ── 2. Check for Node.js ──────────────────────────────────────────────────────
info "Checking Node.js..."
if ! command -v node &>/dev/null; then
    info "Node.js not found — installing LTS via NodeSource..."
    if command -v apt-get &>/dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif command -v dnf &>/dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
        sudo dnf install -y nodejs
    else
        die "Cannot auto-install Node.js. Install Node.js >= ${MIN_NODE_MAJOR} from https://nodejs.org and re-run."
    fi
fi

NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [ "${NODE_MAJOR}" -lt "${MIN_NODE_MAJOR}" ]; then
    die "Node.js >= ${MIN_NODE_MAJOR} required (found v${NODE_MAJOR}). Please upgrade."
fi
success "Node.js $(node --version) — OK"

# ── 3. Check for npm ──────────────────────────────────────────────────────────
command -v npm &>/dev/null || die "npm not found. Please install npm."
success "npm $(npm --version) — OK"

# ── 4. Install ────────────────────────────────────────────────────────────────
if [ "${LOCAL_INSTALL}" = true ]; then
    # Running from inside the cloned repo — link it directly, no network needed
    info "Installing from local repo (npm link)..."
    cd "${SCRIPT_DIR}"
    if npm link 2>/dev/null; then
        success "Linked ${PACKAGE_NAME} from local repo."
    else
        sudo npm link
        success "Linked ${PACKAGE_NAME} from local repo (used sudo)."
    fi
else
    # Running via curl pipe — install from npm registry
    info "Installing ${PACKAGE_NAME} from npm registry..."
    if npm install -g "${PACKAGE_NAME}" 2>/dev/null; then
        success "${PACKAGE_NAME} installed from npm."
    else
        die "npm install failed. If you have the repo cloned locally, run ./install.sh from inside it instead of piping from curl."
    fi
fi

# ── 5. Verify & PATH hint ─────────────────────────────────────────────────────
echo ""
if command -v ros2-docker-gen &>/dev/null; then
    success "✅  Installation complete!"
    echo ""
    echo -e "  Run ${BOLD}${CYAN}ros2-docker-gen${RESET} anywhere to generate your Docker setup."
    echo ""
else
    warn "Command not found in PATH yet. Add npm's global bin to your shell:"
    echo ""
    echo "   echo 'export PATH=\"\$(npm prefix -g)/bin:\$PATH\"' >> ~/.bashrc"
    echo "   source ~/.bashrc"
    echo ""
    echo -e "  Then run: ${BOLD}${CYAN}ros2-docker-gen${RESET}"
    echo ""
fi