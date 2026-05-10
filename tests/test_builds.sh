#!/usr/bin/env bash
# =============================================================
# tests/test_builds.sh
# Local build validation for ros2-dockergen.
# Performs "Kitchen Sink" builds for all major platforms.
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

# ── Setup ──────────────────────────────────────────────────
BUILD_DIR="/tmp/ros2-gen-build-tests"
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"

# Ensure QEMU is ready for cross-builds
if ! docker run --rm --privileged multiarch/qemu-user-static --reset -p yes &>/dev/null; then
    info "Setting up QEMU for cross-builds..."
    docker run --rm --privileged multiarch/qemu-user-static --reset -p yes
fi

# ── Build Function ─────────────────────────────────────────
test_build() {
    local name=$1
    local platform=$2
    shift 2
    local out="${BUILD_DIR}/${name}"
    mkdir -p "${out}"

    info "Testing Build: ${name} (${platform})"
    
    # 1. Generate "Kitchen Sink" config
    node CI/generate.js \
        --distro   jazzy \
        --variant  desktop-full \
        --packages "nav2,slam_toolbox,cartographer,gazebo,rviz2,turtlebot3,moveit2,ros2_control,pcl,cv_bridge,tf2,cyclone_dds" \
        --tools    "colcon,rosdep,python3,git,cmake,nano,tmux,gdb,net_tools,vcstool,ssh,x11,zsh,bashrc,locale,sudo" \
        --username test-user \
        --out      "${out}" \
        "$@"

    # 2. Build Image (Dry run / Check architecture)
    # We use --load to bring it into local docker for verification
    if docker buildx build --platform "${platform}" -t "ros2-test-${name}:latest" --load "${out}"; then
        local arch=$(docker inspect "ros2-test-${name}:latest" --format '{{.Architecture}}')
        success "Build passed! Image architecture: ${arch}"
    else
        error "Build FAILED for ${name}"
        exit 1
    fi
}

# ── Test Matrix ────────────────────────────────────────────

# 1. Linux Desktop (amd64)
test_build "desktop-amd64" "linux/amd64" --host-os linux

# 2. Raspberry Pi (arm64)
test_build "pi-arm64" "linux/arm64" --host-os raspberry-pi-arm64

# 3. Jetson Orin (arm64 + nvidia-l4t)
test_build "jetson-orin" "linux/arm64" --host-os jetson-orin-jetpack6-arm64

# 4. Jetson Thor (arm64 + nvidia-l4t)
test_build "jetson-thor" "linux/arm64" --host-os jetson-thor-jetpack7-arm64

echo ""
echo -e "${BOLD}${GREEN}All build tests passed!${RESET} ✨"
echo ""
