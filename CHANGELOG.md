# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Intelligent Choice Relationships**: Variant selections like `desktop-full` now automatically imply required packages (`rviz2`, `gazebo`/`gz_sim`), and GUI packages automatically enable `x11` display forwarding.
- **Host OS Awareness**: New "Host OS" selection (auto-detected in CLI and Web) provides tailored Docker Compose scaffolding for Linux, Windows 11 (WSLg), and Windows 10 (X11).
- **Core Engine Upgrades**: New `resolve_config()` method in both Python and JS core modules to handle automatic dependency resolution and OS-specific scaffolding.
- Output-shape regression tests in `tests/test_output_shape.py` to verify repo-root workspace mounts, shell config generation, NVIDIA compose behavior, and README/package consistency.
- Web bundle regression tests in `tests/test_web_bundle.py` to verify the website zip export contains the expected files and preserves byte-identical generated content.
- Readiness checks in `CI/validate.sh` for writable default workspaces, `colcon mixin list`, and Oh My Zsh ownership in generated non-root containers.
- CI workflow coverage for the new readiness invariants, including mounted default workspace validation and source-change triggers for heavier generator test jobs.
- A lightweight zip bundler for the web UI and a local `scripts/run_act.sh` helper for reproducible sequential `act` runs without introducing third-party JS dependencies.

### Changed
- Generated `docker-compose.yml` now mounts the current directory into the configured ROS workspace by default instead of creating a nested `./ros2_ws` bind mount.
- Generated Dockerfiles now install Oh My Zsh in the selected user's home after switching to that user, while keeping Zsh as a normal optional tool selection.
- Generated shell bootstrap now writes ROS/environment setup into `.bashrc` when `bashrc` is selected and into `.zshrc` when `zsh` is selected.
- Generated README content now reflects the repo-root workspace workflow, includes clearer NVIDIA host/runtime guidance, and documents the new local `act` runner behavior.
- CLI/web generation and CI helpers now consistently use the standard non-root `user` mode and current host UID mapping for dev-container readiness.
- Shared defaults now drive Web, CLI, and CI generation consistently, including the default `ros2-<distro>` container name and default tool selection set.
- TensorRT now behaves like a real selectable package and emits install steps from the NVIDIA CUDA image package repositories instead of acting as a placeholder selection.
- The web UI now exports a real zip bundle containing `Dockerfile`, `docker-compose.yml`, and `README.md`, and local `act` runs now execute jobs sequentially with matrix fan-out capped to keep disk usage manageable.

### Fixed
- Resolved generated non-root dev environments depending on Docker auto-creating a writable workspace directory with the correct ownership.
- Resolved generated Zsh environments installing Oh My Zsh under `/root` instead of the selected non-root user.
- Removed misleading generated SSH port documentation when host networking is enabled and Docker would discard published ports.
- Resolved website download bundles requiring manual renaming of `Dockerfile` before the generated compose setup could build.

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
