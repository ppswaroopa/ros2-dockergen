# 🤖 ros2-dockergen

> **One command. Interactive. Zero fuss.**  
> Generate production-ready `Dockerfile` + `docker-compose.yml` + `README.md` for any ROS2 project — straight from your terminal.

---

## ✨ Features

- Supports **Jazzy**, **Humble**, **Kilted** ROS2 distributions
- Chooses the right base image (`ros:`, `osrf/ros:`, or `nvidia/cuda:`)
- Configures **ROS2 packages**: Nav2, MoveIt2, SLAM Toolbox, RViz2, TurtleBot3, PCL, cv_bridge, CycloneDDS, ROSBridge, Gazebo, gz-sim, TensorRT, CUDA…
- Configures **dev tools**: colcon, rosdep, cmake, git, tmux, gdb, zsh + Oh-My-Zsh, X11, SSH, net-tools…
- Handles **non-root users** with UID/GID mapping
- Emits a matching `docker-compose.yml` with GPU / X11 / SSH support
- Prints a **README.md** with your exact next steps
- **No external dependencies** — requires only Python 3.10+, which ships on Ubuntu 22.04 and 24.04

---

## 📦 Install

### Requirements

| Requirement    | Version |
|----------------|---------|
| Ubuntu         | 22.04+ (or any Linux with Python 3.10+) |
| Python         | ≥ 3.10 |

### Option A — One-line installer (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/ppswaroopa/ros2-dockergen/main/install.sh | bash
```

The script will check for Python 3.10+ and install the package globally using `pip`.

### Option B — Install via pip (from source)

```bash
git clone https://github.com/ppswaroopa/ros2-dockergen.git
cd ros2-dockergen
pip install .
```

### Option C — Run directly without installing

```bash
git clone https://github.com/ppswaroopa/ros2-dockergen.git
cd ros2-dockergen
export PYTHONPATH=$PYTHONPATH:$(pwd)/src
python3 -m ros2_dockergen
```

---

## 🚀 Usage

```bash
ros2-dockergen           # start the interactive wizard
ros2-dockergen --help    # show help
ros2-dockergen --version # show version
```

The wizard walks you through 8 steps:

| Step | Prompt |
|------|--------|
| 1 | ROS2 distro (Jazzy / Humble / Kilted) |
| 2 | Base image variant (ros-core / ros-base / desktop / desktop-full) |
| 3 | ROS2 packages to include |
| 4 | Dev tools to include |
| 5 | User type (non-root recommended) |
| 6 | Username & UID |
| 7 | Workspace path & container name |
| 8 | Output directory |

Then writes three files:

```
./your-container-name/
├── Dockerfile
├── docker-compose.yml
└── README.md
```

**Navigation:**
- Type a number and press Enter to select
- `1,3,5` — select multiple items
- `a` — select all, `n` — select none
- Enter — keep the shown default
- `q` — quit at any prompt (no files written)

---

## 📁 Project structure

```
- `pyproject.toml`: Modern Python package configuration.
- `src/ros2_dockergen/`: Core Python package (logic + bundled config).
- `src/core.js`: Web-compatible core logic in JavaScript.
- `bin/`: CLI scripts and legacy entry points.
- `tests/`: Parity and validation suite.
- `.github/workflows/`: Automated CI pipeline.
- `index.html`: Webpage to generate Dockerfiles.
```

### How it works

The single source of truth for all ROS2 metadata lives in `src/ros2_dockergen/data/config.json`. The Python CLI and Web UI both consume this config to ensure identical output. For the Python side, this config is bundled as a package resource.

### Running the parity tests

```bash
# Requires both Python 3 and Node.js to be installed
python3 tests/test_parity.py
```

This runs 6 fixture configurations through both `core.py` and `core.js` and
asserts byte-for-byte identical output. Run it any time you edit `config.json`
or either renderer.

---

## 🔗 Related

- [ROS 2 Docker Generator Web UI](https://ppswaroopa.github.io/ros2-dockergen/) — Interactive browser-based version.
- [OSRF ROS Docker images](https://hub.docker.com/r/osrf/ros)
- [ROS2 documentation](https://docs.ros.org)

---

## License

MIT
