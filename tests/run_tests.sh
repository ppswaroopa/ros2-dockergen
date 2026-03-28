#!/usr/bin/env bash
# =============================================================
# tests/run_tests.sh
# Local test runner for ros2-dockergen.
# =============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

info()    { echo -e "${CYAN}--- $* ${RESET}"; }
success() { echo -e "${GREEN}✓ $* ${RESET}"; }
error()   { echo -e "${RED}✗ $* ${RESET}"; }

# ── 1. Parity Tests (Python vs JS) ───────────────────────────
info "Running Parity Tests (Core logic validation)..."
if python3 tests/test_parity.py; then
    success "Parity tests passed."
else
    error "Parity tests failed!"
    exit 1
fi

info "Running Output Shape Regression Tests..."
if PYTHONPATH=src python3 tests/test_output_shape.py; then
    success "Output shape tests passed."
else
    error "Output shape tests failed!"
    exit 1
fi

info "Running Web Bundle Tests..."
if PYTHONPATH=src python3 tests/test_web_bundle.py; then
    success "Web bundle tests passed."
else
    error "Web bundle tests failed!"
    exit 1
fi

# ── 2. Generator Smoke Tests ─────────────────────────────────
info "Running Generator Smoke Tests..."
SMOKE_DIR="/tmp/ros2-gen-smoke"
rm -rf "${SMOKE_DIR}"
mkdir -p "${SMOKE_DIR}"

run_smoke() {
    local name=$1
    shift
    local out="${SMOKE_DIR}/${name}"
    mkdir -p "${out}"
    echo -n "  Testing ${name} ... "
    if node CI/generate.js --out "${out}" "$@" &>/dev/null; then
        echo "ok"
    else
        echo "FAILED"
        error "Generator failed for ${name}"
        exit 1
    fi
}

run_smoke "humble-base" --distro humble --variant ros-base
run_smoke "jazzy-desktop" --distro jazzy --variant desktop
run_smoke "kilted-root" --distro kilted --variant ros-base --usertype root
run_smoke "kitchen-sink" --distro humble --variant desktop-full --packages "nav2,rviz2,gazebo" --tools "colcon,rosdep,git,cmake,sudo"

success "Generator smoke tests passed (Outputs in ${SMOKE_DIR})."

# ── 3. CLI Help Check ───────────────────────────────────────
info "Checking CLI help output..."
if PYTHONPATH=src python3 -m ros2_dockergen --help &>/dev/null; then
    success "CLI help works."
else
    error "CLI help failed!"
    exit 1
fi

echo ""
echo -e "${BOLD}${GREEN}All local tests passed!${RESET} ✨"
echo ""
