# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Output-shape regression tests in `tests/test_output_shape.py` to verify repo-root workspace mounts, shell config generation, NVIDIA compose behavior, and README/package consistency.
- Readiness checks in `CI/validate.sh` for writable default workspaces, `colcon mixin list`, and Oh My Zsh ownership in generated non-root containers.
- CI workflow coverage for the new readiness invariants, including mounted default workspace validation and source-change triggers for heavier generator test jobs.

### Changed
- Generated `docker-compose.yml` now mounts the current directory into the configured ROS workspace by default instead of creating a nested `./ros2_ws` bind mount.
- Generated Dockerfiles now install Oh My Zsh in the selected user's home after switching to that user, while keeping Zsh as a normal optional tool selection.
- Generated shell bootstrap now writes ROS/environment setup into `.bashrc` when `bashrc` is selected and into `.zshrc` when `zsh` is selected.
- Generated README content now reflects the repo-root workspace workflow, includes clearer NVIDIA host/runtime guidance, and hides readme-only package labels such as TensorRT unless they are actually installed.
- CLI/web generation and CI helpers now consistently use the standard non-root `user` mode and current host UID mapping for dev-container readiness.

### Fixed
- Resolved generated non-root dev environments depending on Docker auto-creating a writable workspace directory with the correct ownership.
- Resolved generated Zsh environments installing Oh My Zsh under `/root` instead of the selected non-root user.
- Removed misleading generated SSH port documentation when host networking is enabled and Docker would discard published ports.

## [1.1.0] - 2026-03-25

### Added
- Centralized project versioning using `config.json` as the single source of truth.
- Integrated `hatch-regex` for dynamic versioning in `pyproject.toml`.
- Added a comprehensive version consistency test suite (`tests/test_version.py`).
- Added `tests/sync_version.py` for automated version management.
- Added GitHub Actions for automated publishing to GitHub Releases.
- Automated publication to PyPI and GitHub Releases via `softprops/action-gh-release@v2`.
- `build-check` verification step in PR pipelines (`ci.yml`) to guarantee PyPI package build success.
- Local Git `pre-push` hook installation script (`scripts/install_hooks.sh`) for fast local CI checks.

### Changed
- Refactored `index.html` and CLI to dynamically consume version from `config.json`.

### Removed
- Legacy Node-based CLI implementation in favor of the Python-based CLI.

## [1.0.2] - 2026-03-24

### Added
- Created `CHANGELOG.md` to track project history.

### Fixed
- Auto-update workspace path based on username and user-type selections.
- Unified default username to `ros-dev` across CLI and Web for parity.

### Changed
- Refreshed the "Flow" hero graphic in `README.md` with an updated design.

## [1.0.1] - 2026-03-21

### Changed
- Revamped `README.md` with new hero graphic and structural improvements.
- Fixed leftover project name references and updated branding.

## [1.0.0] - 2026-03-21

### Added
- Initial stable release of `ros2-dockergen`.
- Interactive CLI wizard for ROS2 Docker environment generation.
- Byte-identical parity between Web UI and CLI outputs.
- Support for multiple ROS2 distributions (Humble, Jazzy, Kilted).
- Support for GPU acceleration (NVIDIA CUDA/TensorRT).
