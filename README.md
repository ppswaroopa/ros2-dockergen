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

The script will:
1. Check for Python 3.10+
2. Copy the tool to `/usr/local/lib/ros2-dockergen/`
3. Create a `/usr/local/bin/ros2-dockergen` symlink

### Option B — Clone and install locally

```bash
git clone https://github.com/ppswaroopa/ros2-dockergen.git
cd ros2-dockergen
./install.sh
```

### Option C — Run directly without installing

```bash
git clone https://github.com/ppswaroopa/ros2-dockergen.git
cd ros2-dockergen
python3 bin/ros2-dockergen
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
- `bin/`: CLI entry points and scripts.
- `src/`: Core logic (Python for CLI, JavaScript for Web).
- `data/`: `config.json` single source of truth.
- `tests/`: Parity and validation suite.
- `CI/`: helper scripts for CI/CD.
- `.github/workflows/`: Automated CI pipeline.
- `index.html`: Webpage to generate Dockerfiles.
```

### How it works

All package knowledge lives in `data/config.json`. The `core.py` and `core.js` only read the config and render output strings from it. Web UI and CLI share the same knowledge base. To add a new package or distro, you edit `config.json` once and both tools update automatically.

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
