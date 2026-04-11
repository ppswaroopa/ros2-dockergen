#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ros2-dockergen — Installer
#
# Usage (from inside the cloned repo):
#   ./install.sh
#
# Usage (remote):
#   curl -fsSL https://raw.githubusercontent.com/ppswaroopa/ros2-dockergen/main/install.sh | bash
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PACKAGE_NAME="ros2-dockergen"
MIN_PYTHON_MINOR=10

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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_INSTALL=false

if [[ -f "${SCRIPT_DIR}/pyproject.toml" && -d "${SCRIPT_DIR}/src/ros2_dockergen" ]]; then
    LOCAL_INSTALL=true
    info "Detected local repo at: ${SCRIPT_DIR}"
fi

# ── 2. Check for Python 3.10+ ────────────────────────────────────────────────
info "Checking Python 3..."

PYTHON=""
for candidate in python3 python3.13 python3.12 python3.11 python3.10; do
    path=$(command -v "${candidate}" 2>/dev/null)
    if [[ -n "${path}" ]]; then
        minor=$("${path}" -c "import sys; print(sys.version_info.minor)")
        major=$("${path}" -c "import sys; print(sys.version_info.major)")
        if [[ "${major}" -eq 3 && "${minor}" -ge "${MIN_PYTHON_MINOR}" ]]; then
            PYTHON="${path}"
            break
        fi
    fi
done

if [[ -z "${PYTHON}" ]]; then
    die "Python 3.${MIN_PYTHON_MINOR}+ not found. Please install it and re-run."
fi

success "$("${PYTHON}" --version) — OK"

# ── 3. Install ────────────────────────────────────────────────────────────────
do_install() {
    local src="$1"
    info "Installing package via pip..."
    sudo "${PYTHON}" -m pip install "${src}"
}

if [[ "${LOCAL_INSTALL}" = true ]]; then
    info "Installing from local repo..."
    do_install "${SCRIPT_DIR}"
    success "Installed successfully via pip."
else
    info "Remote install — cloning repository..."
    command -v git &>/dev/null || {
        command -v apt-get &>/dev/null && sudo apt-get install -y git \
            || die "git is required for remote install."
    }
    CLONE_DIR="$(mktemp -d)"
    git clone --depth 1 "https://github.com/ppswaroopa/ros2-dockergen.git" "${CLONE_DIR}"
    do_install "${CLONE_DIR}"
    rm -rf "${CLONE_DIR}"
    success "Installed successfully via pip."
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
    warn "Package installed but '${PACKAGE_NAME}' command not found in PATH."
    echo "  You may need to add ~/.local/bin to your PATH or use 'python3 -m ros2_dockergen'."
    echo ""
fi
