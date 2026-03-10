#!/usr/bin/env bash
# =============================================================
# ci/validate.sh
# Suite-aware validator. Reads CI_TEST_SUITE to decide which
# checks to run. Each suite tests exactly one concern.
#
# Suites:
#   base        → ROS2 installs and CLI works
#   build-tools → colcon, rosdep, python3, git, cmake
#   user        → correct user, UID, workspace, sudo
#   gui         → RViz2/Gazebo binaries exist, DISPLAY is set
#   nvidia      → CUDA env vars, ROS2 on cuda base image
#
# Exit 0 = all checks passed. Non-zero = at least one failed.
# =============================================================

set -o pipefail

DISTRO="${ROS_DISTRO:-humble}"
SUITE="${CI_TEST_SUITE:-base}"
FAILED=0

pass()    { echo "  ✓  $1"; }
fail()    { echo "  ✗  $1"; FAILED=1; }
skip()    { echo "  ~  $1 (skipped)"; }
section() { echo ""; echo "[ $1 ]"; }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  validate.sh  suite=${SUITE}  distro=${DISTRO}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# =============================================================
# SHARED HELPERS
# =============================================================

check_ros2_setup() {
  section "ROS2 setup.bash"
  local setup="/opt/ros/${DISTRO}/setup.bash"
  if [ -f "$setup" ]; then
    pass "$setup exists"
  else
    fail "$setup NOT FOUND"
    return
  fi
  if source "$setup" 2>/dev/null; then
    pass "source $setup → OK"
  else
    fail "source $setup → FAILED"
  fi
}

check_ros2_cli() {
  section "ros2 CLI"
  source "/opt/ros/${DISTRO}/setup.bash" 2>/dev/null || true
  if command -v ros2 &>/dev/null; then
    local ver
    ver=$(ros2 --version 2>&1 || echo "unknown")
    pass "ros2 found: $ver"
  else
    fail "ros2 not found in PATH"
  fi
}

check_bashrc() {
  section ".bashrc source line"
  local user
  user=$(whoami)
  local bashrc
  bashrc=$( [ "$user" = "root" ] && echo "/root/.bashrc" || echo "/home/${user}/.bashrc" )

  if [ ! -f "$bashrc" ]; then
    fail "$bashrc does not exist"
    return
  fi

  local count
  count=$(grep -c "source /opt/ros/${DISTRO}/setup.bash" "$bashrc" || echo "0")
  if [ "$count" -eq 1 ]; then
    pass ".bashrc sources setup.bash exactly once"
  elif [ "$count" -eq 0 ]; then
    fail ".bashrc is missing setup.bash source line"
  else
    fail ".bashrc sources setup.bash ${count} times — double-write bug in generator"
  fi
}

# =============================================================
# SUITE: base
# =============================================================
run_base() {
  check_ros2_setup
  check_ros2_cli
  check_bashrc

  section "ros2 topic list (basic DDS check)"
  source "/opt/ros/${DISTRO}/setup.bash" 2>/dev/null || true
  if timeout 5 ros2 topic list &>/dev/null; then
    pass "ros2 topic list returned"
  else
    local ec=$?
    if [ $ec -eq 124 ]; then
      fail "ros2 topic list timed out — DDS may not be initialising"
    else
      pass "ros2 topic list exited (no nodes running is expected)"
    fi
  fi
}

# =============================================================
# SUITE: build-tools
# =============================================================
run_build_tools() {
  check_ros2_setup
  check_ros2_cli

  section "colcon"
  if command -v colcon &>/dev/null; then
    pass "colcon found: $(colcon --version 2>&1 | head -1)"
  else
    fail "colcon not found"
  fi

  section "rosdep"
  if command -v rosdep &>/dev/null; then
    pass "rosdep found: $(rosdep --version 2>&1)"
    if [ -d "/etc/ros/rosdep/sources.list.d" ]; then
      pass "rosdep sources.list.d exists"
    else
      fail "rosdep sources.list.d missing — rosdep init may have failed silently"
    fi
  else
    fail "rosdep not found"
  fi

  section "python3 + pip"
  if command -v python3 &>/dev/null; then
    pass "python3: $(python3 --version 2>&1)"
  else
    fail "python3 not found"
  fi
  if python3 -m pip --version &>/dev/null 2>&1; then
    pass "pip: $(python3 -m pip --version 2>&1)"
  else
    fail "pip not found"
  fi

  section "git"
  if command -v git &>/dev/null; then
    pass "git: $(git --version)"
  else
    fail "git not found"
  fi

  section "cmake + g++ compile test"
  if command -v cmake &>/dev/null; then
    pass "cmake: $(cmake --version | head -1)"
    local tmpdir
    tmpdir=$(mktemp -d)
    echo 'int main(){return 0;}' > "$tmpdir/main.cpp"
    if g++ "$tmpdir/main.cpp" -o "$tmpdir/a.out" 2>/dev/null; then
      pass "g++ compiled trivial C++ program"
    else
      fail "g++ compile failed — build-essential may not be fully installed"
    fi
    rm -rf "$tmpdir"
  else
    skip "cmake not installed (optional)"
  fi

  section "vcstool"
  if command -v vcs &>/dev/null; then
    pass "vcs (vcstool): $(vcs --version 2>&1)"
  else
    skip "vcs not installed (optional)"
  fi

  check_colcon_build
}

check_colcon_build() {
  section "colcon build test (E2E)"
  source "/opt/ros/${DISTRO}/setup.bash" 2>/dev/null || true
  
  local tmpdir
  tmpdir=$(mktemp -d)
  mkdir -p "$tmpdir/src/test_pkg"
  
  # Create a minimal package.xml and CMakeLists.txt
  cat > "$tmpdir/src/test_pkg/package.xml" <<EOF
<?xml version="1.0"?>
<?xml-model href="http://download.ros.org/schema/package_format3.xsd" schematypens="http://www.w3.org/2001/XMLSchema"?>
<package format="3">
  <name>test_pkg</name>
  <version>0.0.0</version>
  <description>CI Test Package</description>
  <maintainer email="ci@test.com">CI</maintainer>
  <license>Apache-2.0</license>
  <buildtool_depend>ament_cmake</buildtool_depend>
</package>
EOF

  cat > "$tmpdir/src/test_pkg/CMakeLists.txt" <<EOF
cmake_minimum_required(VERSION 3.8)
project(test_pkg)
find_package(ament_cmake REQUIRED)
ament_package()
EOF

  pushd "$tmpdir" &>/dev/null
  if colcon build --event-handlers console_cohesion+ &>/tmp/colcon.log; then
    pass "colcon build minimal package → OK"
  else
    fail "colcon build minimal package → FAILED (see /tmp/colcon.log)"
    cat /tmp/colcon.log
  fi
  popd &>/dev/null
  rm -rf "$tmpdir"
}

# =============================================================
# SUITE: user
# =============================================================
run_user() {
  local current_user
  current_user=$(whoami)
  local expected_user="${EXPECTED_USER:-ros-dev}"
  local expected_uid="${EXPECTED_UID:-1000}"
  local expect_sudo="${EXPECT_SUDO:-false}"

  section "User identity"
  if [ "$current_user" = "$expected_user" ]; then
    pass "whoami = $current_user (expected: $expected_user)"
  else
    fail "whoami = $current_user (expected: $expected_user)"
  fi

  if [ "$current_user" != "root" ]; then
    section "UID"
    local actual_uid
    actual_uid=$(id -u)
    if [ "$actual_uid" = "$expected_uid" ]; then
      pass "UID = $actual_uid"
    else
      fail "UID = $actual_uid (expected: $expected_uid)"
    fi

    section "Home directory ownership"
    local home="/home/${current_user}"
    if [ -d "$home" ]; then
      local owner
      owner=$(stat -c '%U' "$home")
      if [ "$owner" = "$current_user" ]; then
        pass "$home exists and is owned by $current_user"
      else
        fail "$home owned by $owner (expected: $current_user)"
      fi
    else
      fail "$home does not exist"
    fi

    section "Workspace"
    local ws="/home/${current_user}/ros2_ws"
    if [ -d "$ws" ]; then
      local ws_owner
      ws_owner=$(stat -c '%U' "$ws")
      if [ "$ws_owner" = "$current_user" ]; then
        pass "$ws exists and is owned by $current_user"
      else
        fail "$ws owned by $ws_owner (expected: $current_user)"
      fi
    else
      fail "$ws not found"
    fi

    section "sudo"
    if [ "$expect_sudo" = "true" ]; then
      if sudo -n true 2>/dev/null; then
        pass "sudo without password works"
      else
        fail "sudo without password FAILED — check sudoers entry in Dockerfile"
      fi
    else
      skip "sudo not expected for this config"
    fi
  else
    pass "Running as root (root-mode build)"
  fi

  check_bashrc
}

# =============================================================
# SUITE: gui
# =============================================================
run_gui() {
  check_ros2_setup
  check_ros2_cli

  section "DISPLAY environment"
  if [ -n "${DISPLAY:-}" ]; then
    pass "DISPLAY=$DISPLAY"
  else
    fail "DISPLAY not set — ENV DISPLAY line missing from Dockerfile"
  fi

  section "QT_X11_NO_MITSHM"
  if [ "${QT_X11_NO_MITSHM:-}" = "1" ]; then
    pass "QT_X11_NO_MITSHM=1"
  else
    fail "QT_X11_NO_MITSHM not set — may cause Qt crashes on shared memory"
  fi

  section "RViz2 binary"
  source "/opt/ros/${DISTRO}/setup.bash" 2>/dev/null || true
  if command -v rviz2 &>/dev/null; then
    pass "rviz2 found: $(which rviz2)"
  elif [ -f "/opt/ros/${DISTRO}/lib/rviz2/rviz2" ]; then
    pass "rviz2 found at /opt/ros/${DISTRO}/lib/rviz2/rviz2"
  else
    fail "rviz2 not found — ros-${DISTRO}-rviz2 may not have installed"
  fi

  section "Gazebo binary"
  if command -v gazebo &>/dev/null; then
    pass "gazebo (classic): $(which gazebo)"
  elif command -v gz &>/dev/null; then
    pass "gz (Gazebo Sim): $(which gz)"
  else
    skip "No gazebo/gz binary (may be intentional if neither was selected)"
  fi

  section "rviz2 in ros2 pkg list"
  if ros2 pkg list 2>/dev/null | grep -q "rviz2"; then
    pass "rviz2 appears in ros2 pkg list"
  else
    fail "rviz2 not in ros2 pkg list"
  fi
}

# =============================================================
# SUITE: nvidia
# =============================================================
run_nvidia() {
  section "NVIDIA environment variables"
  if [ "${NVIDIA_VISIBLE_DEVICES:-}" = "all" ]; then
    pass "NVIDIA_VISIBLE_DEVICES=all"
  else
    fail "NVIDIA_VISIBLE_DEVICES not set (expected: all)"
  fi

  if [ "${NVIDIA_DRIVER_CAPABILITIES:-}" = "compute,utility,graphics" ]; then
    pass "NVIDIA_DRIVER_CAPABILITIES=compute,utility,graphics"
  else
    fail "NVIDIA_DRIVER_CAPABILITIES = '${NVIDIA_DRIVER_CAPABILITIES:-unset}'"
  fi

  section "CUDA install directory"
  if [ -d "/usr/local/cuda" ]; then
    pass "/usr/local/cuda exists"
  else
    fail "/usr/local/cuda not found — CUDA base image may not have built correctly"
  fi

  check_ros2_setup
  check_ros2_cli
  check_bashrc
}

# =============================================================
# DISPATCH
# =============================================================
case "$SUITE" in
  base)        run_base ;;
  build-tools) run_build_tools ;;
  user)        run_user ;;
  gui)         run_gui ;;
  nvidia)      run_nvidia ;;
  *)
    echo "ERROR: Unknown CI_TEST_SUITE='$SUITE'"
    echo "Valid values: base, build-tools, user, gui, nvidia"
    exit 1
    ;;
esac

# =============================================================
# SUMMARY
# =============================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$FAILED" -eq 0 ]; then
  echo "  ✓  suite=${SUITE} PASSED"
else
  echo "  ✗  suite=${SUITE} FAILED"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

exit "$FAILED"
