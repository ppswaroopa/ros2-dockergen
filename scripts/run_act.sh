#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW="${ROOT}/.github/workflows/ci.yml"
IMAGE="${ACT_IMAGE:-catthehacker/ubuntu:act-latest}"
MODE="${1:-sequential}"

if ! command -v act >/dev/null 2>&1; then
    echo "act is not installed. Install it first: https://nektosact.com/installation/" >&2
    exit 1
fi

cd "${ROOT}"

run_job() {
    local job="$1"
    echo ""
    echo "============================================================="
    echo "Running act job: ${job}"
    echo "============================================================="
    act workflow_dispatch \
        -W "${WORKFLOW}" \
        --input run_all=true \
        -P "ubuntu-latest=${IMAGE}" \
        -j "${job}"
}

if [[ "${MODE}" == "full" ]]; then
    shift || true
    exec act workflow_dispatch \
        -W "${WORKFLOW}" \
        --input run_all=true \
        -P "ubuntu-latest=${IMAGE}" \
        "$@"
fi

if [[ "${MODE}" != "sequential" ]]; then
    echo "Unknown mode: ${MODE}" >&2
    echo "Usage: ./scripts/run_act.sh [sequential|full]" >&2
    exit 1
fi

jobs=(
    version-check
    build-check
    base-humble
    base-humble-desktop
    base-jazzy
    base-jazzy-desktop
    base-kilted
    base-kilted-desktop
    build-tools
    user-setup
    gui
    nvidia
    kitchen-sink
)

for job in "${jobs[@]}"; do
    run_job "${job}"
done

echo ""
echo "All act jobs completed successfully."
