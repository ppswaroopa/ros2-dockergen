#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ros2-docker-gen — Installer
#
# Usage (from inside the cloned repo):
#   ./install.sh
#
# Usage (remote, once the repo is public):
#   curl -fsSL https://raw.githubusercontent.com/ppswaroopa/ros2-playground/main/install.sh | bash
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PACKAGE_NAME="ros2-docker-gen"
MIN_PYTHON_MINOR=10
INSTALL_DIR="/usr/local/lib/${PACKAGE_NAME}"
BIN_LINK="/usr/local/bin/${PACKAGE_NAME}"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}[${PACKAGE_NAME}]${RESET} $*"; }
success() { echo -e "${GREEN}[${PACKAGE_NAME}]${RESET} $*"; }
warn()    { echo -e "${RED}[${PACKAGE_NAME}] WARN:${RESET} $*"; }
die()     { echo -e "${RED}[${PACKAGE_NAME}] ERROR:${RESET} $*" >&2; exit 1; }

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}║       🤖  ROS2 Docker Generator — Installer          ║${RESET}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""

# ── 1. Locate the repo root ───────────────────────────────────────────────────
SCRIPT_DIR=""
LOCAL_INSTALL=false

if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

if [[ -n "${SCRIPT_DIR}"                              \
   && -f "${SCRIPT_DIR}/bin/${PACKAGE_NAME}"          \
   && -f "${SCRIPT_DIR}/src/core.py"                  \
   && -f "${SCRIPT_DIR}/data/config.json" ]]; then
    LOCAL_INSTALL=true
    info "Detected local repo at: ${SCRIPT_DIR}"
fi

# ── 2. Check for Python 3.10+ ────────────────────────────────────────────────
info "Checking Python 3..."

PYTHON=""
for candidate in python3 python3.13 python3.12 python3.11 python3.10; do
    if command -v "${candidate}" &>/dev/null; then
        minor=$("${candidate}" -c "import sys; print(sys.version_info.minor)")
        major=$("${candidate}" -c "import sys; print(sys.version_info.major)")
        if [[ "${major}" -eq 3 && "${minor}" -ge "${MIN_PYTHON_MINOR}" ]]; then
            PYTHON="${candidate}"
            break
        fi
    fi
done

if [[ -z "${PYTHON}" ]]; then
    info "Python 3.${MIN_PYTHON_MINOR}+ not found — installing via apt..."
    if command -v apt-get &>/dev/null; then
        sudo apt-get update -qq
        sudo apt-get install -y python3
        PYTHON="python3"
    else
        die "Please install Python 3.${MIN_PYTHON_MINOR}+ and re-run."
    fi
fi

success "$("${PYTHON}" --version) — OK"

# ── 3. Install ────────────────────────────────────────────────────────────────
do_install() {
    local src="$1"
    sudo mkdir -p "${INSTALL_DIR}"
    sudo cp -r "${src}/src"  "${INSTALL_DIR}/"
    sudo cp -r "${src}/data" "${INSTALL_DIR}/"
    sudo cp -r "${src}/bin"  "${INSTALL_DIR}/"
    sudo chmod +x "${INSTALL_DIR}/bin/${PACKAGE_NAME}"
    sudo sed -i "1s|.*|#!${PYTHON}|" "${INSTALL_DIR}/bin/${PACKAGE_NAME}"
    sudo ln -sf "${INSTALL_DIR}/bin/${PACKAGE_NAME}" "${BIN_LINK}"
}

if [[ "${LOCAL_INSTALL}" = true ]]; then
    info "Installing from local repo..."
    do_install "${SCRIPT_DIR}"
    success "Installed to ${INSTALL_DIR}"
else
    info "Remote install — cloning repository..."
    command -v git &>/dev/null || {
        command -v apt-get &>/dev/null && sudo apt-get install -y git \
            || die "git is required for remote install."
    }
    CLONE_DIR="$(mktemp -d)"
    git clone --depth 1 "https://github.com/ppswaroopa/ros2-playground.git" "${CLONE_DIR}"
    do_install "${CLONE_DIR}"
    rm -rf "${CLONE_DIR}"
    success "Installed to ${INSTALL_DIR}"
fi

# ── 4. Verify ─────────────────────────────────────────────────────────────────
echo ""
if command -v "${PACKAGE_NAME}" &>/dev/null; then
    success "✅  Installation complete!"
    echo ""
    echo -e "  Run ${BOLD}${CYAN}${PACKAGE_NAME}${RESET} to generate your Docker setup."
    echo -e "  Run ${BOLD}${CYAN}${PACKAGE_NAME} --help${RESET} for usage details."
    echo ""
else
    warn "Command not in PATH. Add /usr/local/bin if needed:"
    echo "    echo 'export PATH=\"/usr/local/bin:\$PATH\"' >> ~/.bashrc && source ~/.bashrc"
    echo ""
fi
