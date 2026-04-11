#!/usr/bin/env bash
# =============================================================
# install_hooks.sh
# Installs local git hooks for the ros2-dockergen repository
# to catch simple errors before pushing to the remote.
# =============================================================

set -e

HOOKS_DIR=".git/hooks"
PRE_PUSH_HOOK="${HOOKS_DIR}/pre-push"

if [ ! -d ".git" ]; then
  echo "Error: This script must be run from the root of the repository."
  exit 1
fi

echo "Installing pre-push hook..."

cat > "$PRE_PUSH_HOOK" << 'EOF'
#!/usr/bin/env bash
# =============================================================
# pre-push git hook
# Runs a quick Python build check to catch PyPI packaging
# errors locally before they break the CI pipeline.
# =============================================================

echo ""
echo "==== Running pre-push checks ===="

# Use a temporary virtual environment to avoid PEP-668 "externally-managed-environment" errors
VENV_DIR="/tmp/ros2-dockergen-pre-push-venv"

if [ ! -d "$VENV_DIR" ]; then
  echo "Creating isolated build environment..."
  python3 -m venv "$VENV_DIR" > /dev/null
  "$VENV_DIR/bin/pip" install build > /dev/null
fi

echo "Verifying Python package build..."
if ! "$VENV_DIR/bin/python" -m build > /dev/null; then
    echo "❌ ERROR: 'python3 -m build' failed!"
    echo "This means the package will fail to publish on PyPI."
    echo "Please run 'python3 -m build' locally to see the error details."
    echo "Push aborted."
    echo "================================="
    exit 1
fi

echo "✓ Build check passed."
echo "================================="
echo ""
exit 0
EOF

chmod +x "$PRE_PUSH_HOOK"

echo "✓ Successfully installed .git/hooks/pre-push!"
echo "Now, every time you run 'git push', it will verify the Python package builds securely."
