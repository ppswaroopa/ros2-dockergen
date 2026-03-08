# Portfolio — Pranava Swaroopa

Personal portfolio site hosted on GitHub Pages, including the **ROS2 Docker Generator** —
a browser-based tool for generating ROS2 Docker environments without needing to know Docker.

Live at: `https://<username>.github.io`

---

## Repository Structure

```
.
│   .gitignore
│   index.html                          # Portfolio landing page
│   index.html          # ROS2 Docker Generator — standalone tool
│
├── src/
│   ├── css/
│   │   └── style.css                   # Portfolio styles
│   ├── script/
│   │   └── script.js                   # Portfolio scripts
│   ├── images/                         # All portfolio images and assets
│   ├── font/                           # Custom fonts
│   └── documents/                      # CV and presentation PDFs
│
├── ros2-docker-generator/
│   ├── generate.js                     # Dockerfile + Compose generation logic (Node.js, no deps)
│   └── validate.sh                     # Runs inside each built container to verify correctness
│
└── .github/
    └── workflows/
        ├── ci.yml                      # Main CI orchestrator — path-filtered, calls reusable workflows
        ├── _test-base.yml              # Tests ROS2 installs correctly per distro
        ├── _test-build-tools.yml       # Tests dev tool apt packages (colcon, git, cmake, etc.)
        ├── _test-user-setup.yml        # Tests user creation (custom user vs root — 2 cases only)
        ├── _test-gui.yml               # Tests GUI packages (RViz2, Gazebo) using Xvfb virtual display
        └── _test-nvidia.yml            # Tests CUDA base image + ROS2 on top
```

The `ros2-docker-generator/` folder and `.github/` workflows relate exclusively to testing `index.html`.
The rest of the portfolio (`index.html`, `src/`) is static and has no CI.

---

## The ROS2 Docker Generator

`index.html` is a fully self-contained single-page app — no build step,
no backend, no dependencies. It generates files entirely in the browser using JavaScript.
Nothing is sent to any server.

A user visits the page, picks their ROS2 distro, selects packages and dev tools, configures
their user, and downloads a `Dockerfile` + `docker-compose.yml` they can use immediately.
The goal is to remove the friction of getting started with ROS2 on Docker, especially for
Windows users using WSL2.

### How it links from the portfolio

`index.html` links to `index.html` as a project entry. Both files sit at the
repo root so GitHub Pages serves them both at the same base URL:

```
https://<username>.github.io/index.html                    ← portfolio
https://<username>.github.io/index.html    ← generator tool
```

---

## How the CI Works

### The Problem

The generator produces Dockerfiles dynamically. To know they actually work, CI must build
and run them as real Docker images. But testing every possible combination of options would
be extremely slow — most combinations are redundant.

### Design Principle: Test by Concern, Not by Combination

CI is structured around the insight that the generator works in independent layers.
Each layer only needs to be tested once, not once per distro or per package combination:

| Layer | Why it's independent | Tested in |
|---|---|---|
| **Base image** | Package names differ per distro, so this runs per distro | `_test-base.yml` |
| **Build tools** | Just `apt-get install` lines — same syntax on all distros | `_test-build-tools.yml` — once |
| **User setup** | Only 2 possible outcomes: root or custom user | `_test-user-setup.yml` — 2 cases |
| **GUI packages** | Binaries either install or they don't; tested with a virtual display | `_test-gui.yml` — once |
| **NVIDIA** | Completely different base image, separate concern | `_test-nvidia.yml` — once |

For example: once `colcon` is confirmed to install and run on Humble, there is no new
information to be gained by installing it again on Jazzy. The `apt-get install` command
is structurally identical. Only the base image layer needs per-distro jobs.

### Path Filtering — What Triggers What

The `ci.yml` orchestrator runs a `changes` job first, which uses `dorny/paths-filter` to
detect which files changed in the push. Downstream jobs only run if their relevant files changed.

| Files changed in the push | Jobs that run |
|---|---|
| `index.html` or `index.html` | `base-humble` smoke check only |
| `ros2-docker-generator/generate.js` | All suites — generation logic changed, everything must re-verify |
| `ros2-docker-generator/validate.sh` | All suites — the validator itself changed |
| `.github/workflows/_test-nvidia.yml` only | `nvidia` only |
| `.github/workflows/_test-user-setup.yml` only | `user-setup` only |

A typical portfolio update (editing `style.css`, swapping an image) runs the smoke check
in ~3 minutes. A change to `generate.js` runs the full suite in ~30–45 minutes.

### Reusable Workflows

Each `_test-*.yml` file is a **reusable workflow**. It cannot be triggered directly by a push —
it can only be called by another workflow using the `uses:` key:

```yaml
# Inside ci.yml:
base-humble:
  uses: ./.github/workflows/_test-base.yml
  with:
    distro: humble
    variant: ros-base
```

The leading `_` in the filename is a convention that signals "internal, not a standalone
entrypoint." GitHub treats it identically to any other workflow file.

### validate.sh — One Script, Five Modes

`ros2-docker-generator/validate.sh` reads a `CI_TEST_SUITE` environment variable and runs only the checks
relevant to that concern. Each job passes a different value:

```bash
docker run -e CI_TEST_SUITE=base    ...   # checks ROS2 CLI works
docker run -e CI_TEST_SUITE=user    ...   # checks username, UID, workspace, sudo
docker run -e CI_TEST_SUITE=gui     ...   # checks DISPLAY env, rviz2 binary, gz binary
docker run -e CI_TEST_SUITE=nvidia  ...   # checks CUDA dirs, NVIDIA env vars
```

This keeps failure messages precise. If the `user` suite fails, you know the `useradd`
or workspace ownership logic in `generate.js` is broken — nothing else.

### The `all-passed` Gate Job

The last job in `ci.yml` always runs regardless of what else was skipped. It checks the
result of every upstream job and fails if any had a result of `failure` or `cancelled`.
A result of `skipped` (path filter didn't match) is treated as passing.

This job is what you configure as a **required status check** in GitHub branch protection
settings — it gives you a single named check to require without needing to list every
individual job.

---

## Running Tests Locally with `act`

[`act`](https://github.com/nektos/act) runs GitHub Actions workflows on your local machine
using Docker. This lets you iterate on CI without pushing to GitHub every time.

### Install act

```bash
# macOS
brew install act

# Windows (WSL2 or Git Bash)
# Download the latest binary from https://github.com/nektos/act/releases
# and place it somewhere on your PATH, e.g. C:\tools\act.exe
```

`act` requires Docker to be running. Since you already have Docker Desktop, nothing
extra is needed.

### First run — choose your runner image

On first run, `act` asks which Docker image to use to simulate the GitHub runner.
Choose **Medium** when prompted — it's a good balance of size and compatibility:

```
? Please choose the default image you want to use with act:
  - Micro    (fastest, but missing many tools)
  - Medium   (recommended)  ← choose this
  - Large    (closest to GitHub's actual runner, ~18GB)
```

This choice is saved to `~/.actrc` and won't be asked again.

### Run a specific workflow job

```bash
# From the repo root — simulate a push to main and run only the base-humble job
act push --job base-humble

# Run the user-setup job
act push --job user-setup

# Run the build-tools job
act push --job build-tools
```

### Run the full CI workflow

```bash
# Run everything (as if you pushed to main)
act push

# Force all suites to run regardless of path filters
act workflow_dispatch --input run_all=true
```

### Run a single test suite manually (without act)

If you just want to test one thing quickly without act's overhead:

```bash
# 1. Generate the Dockerfile for the config you want to test
node ros2-docker-generator/generate.js \
  --distro   humble \
  --variant  ros-base \
  --tools    "colcon,rosdep,python3,git,bashrc,locale,sudo" \
  --username ros-dev \
  --uid      1000 \
  --out      ./build-context

# 2. Build it
docker build -t ros2-test:local ./build-context

# 3. Run the validator for the suite you care about
docker run --rm \
  -e ROS_DISTRO=humble \
  -e CI_TEST_SUITE=base \
  -v "$PWD/ros2-docker-generator/validate.sh:/validate.sh:ro" \
  ros2-test:local bash /validate.sh

# User suite (custom user)
docker run --rm \
  -e ROS_DISTRO=humble \
  -e CI_TEST_SUITE=user \
  -e EXPECTED_USER=ros-dev \
  -e EXPECTED_UID=1000 \
  -e EXPECT_SUDO=true \
  -v "$PWD/ros2-docker-generator/validate.sh:/validate.sh:ro" \
  ros2-test:local bash /validate.sh

# Build tools suite
docker run --rm \
  -e ROS_DISTRO=humble \
  -e CI_TEST_SUITE=build-tools \
  -v "$PWD/ros2-docker-generator/validate.sh:/validate.sh:ro" \
  ros2-test:local bash /validate.sh
```

### act known limitations

- **Reusable workflows** (`uses: ./.github/workflows/_test-base.yml`) have limited support
  in `act`. If a job using `uses:` fails unexpectedly locally, test the inner workflow
  directly using the manual `docker run` approach above, then push to GitHub to confirm
  the full orchestration works.

- **Path filtering** (`dorny/paths-filter`) works differently locally since `act` doesn't
  have a real git diff to compare. Use `act workflow_dispatch --input run_all=true` to
  bypass filters and force everything to run.

---

## Adding a New ROS2 Package to the Generator

When you add a new package option, you must update **two places** — the UI and the CI
generator. They implement the same logic independently (see Known Limitations below).

1. **`index.html`** — add the option card in the packages step and add
   the entry to the `rosPkgMap` object in the `buildDockerfile()` function.

2. **`ros2-docker-generator/generate.js`** — add the same entry to the `getRosPackages()` function.

Before committing, verify the apt package name actually exists for each distro you support:

```bash
# Search for a package name on Humble
docker run --rm ros:humble-ros-base \
  bash -c "apt-get update -qq && apt-cache search ros-humble-<package-name>"

# Search on Jazzy
docker run --rm ros:jazzy-ros-base \
  bash -c "apt-get update -qq && apt-cache search ros-jazzy-<package-name>"
```

If the package name differs between distros (or doesn't exist on one of them), handle it
with a distro conditional in `getRosPackages()` — the same pattern already used for
`turtlebot3-simulations` and `gazebo`.

---

## GitHub Pages Setup

Both HTML files are served directly from the repo root. No build step is needed.

1. Repo → **Settings → Pages**
2. Source: `Deploy from a branch`
3. Branch: `main`, folder: `/ (root)`
4. Save

GitHub Pages will serve every `.html` file at the root automatically. Adding a new tool
page is as simple as dropping another `.html` file in the root and linking to it from
`index.html`.

---

## Known Limitations

**Duplicate generation logic** — The Dockerfile generation logic exists in both
`index.html` and `ros2-docker-generator/generate.js`. A fix to a package name must be
applied in both files. The long-term fix is to extract the shared logic into a
`ros2-docker-generator/generate.js` module that `index.html` loads via a `<script src>` tag.
This is deferred because it would require either a build step or a web server for local
development (browsers block local `file://` script imports by default).

**Jazzy + Gazebo Classic** — Gazebo Classic is not packaged for Ubuntu 24.04, which is
what Jazzy uses. The generator produces an empty package list for this combination rather
than erroring clearly. A future improvement would disable the Gazebo Classic card in the
UI when Jazzy is selected.

**NVIDIA CI can't test GPU runtime** — GitHub Actions runners have no GPU. The NVIDIA
test suite confirms the CUDA base image builds and ROS2 installs on top of it, but cannot
verify CUDA actually executes. Runtime GPU validation would require a self-hosted runner
with an NVIDIA card.

**GUI rendering is not tested** — The GUI suite uses Xvfb (a virtual framebuffer) to
confirm that RViz2 and Gazebo binaries install and exist. It does not test that 3D
rendering or physics simulation work correctly — that requires a real display.
