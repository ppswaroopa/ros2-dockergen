# 🤖 ros2-docker-gen

> **One command. Interactive. Zero fuss.**  
> Generate production-ready `Dockerfile` + `docker-compose.yml` + `README.md` for any ROS2 project — straight from your terminal.

---

## ✨ Features

- Supports **Jazzy**, **Humble**, **Kilted** distros
- Chooses the right base image (`ros:`, `osrf/ros:`, or `nvidia/cuda:`)
- Configures **ROS2 packages**: Nav2, MoveIt2, SLAM Toolbox, RViz2, TurtleBot3, PCL, cv_bridge, CycloneDDS, ROSBridge, Gazebo, gz-sim, TensorRT, CUDA…
- Configures **dev tools**: colcon, rosdep, cmake, git, tmux, gdb, zsh + Oh-My-Zsh, X11, SSH, net-tools…
- Handles **non-root users** with correct UID/GID mapping
- Emits a matching `docker-compose.yml` with GPU / X11 / SSH support
- Prints a **README.md** with your exact next steps
- **No external dependencies** — requires only Python 3.10+, which ships on Ubuntu 22.04 and 24.04

---

## 📦 Install

### Requirements

| Requirement    | Version |
|----------------|---------|
| Ubuntu         | 22.04 or 24.04 (or any Linux with Python 3.10+) |
| Python         | ≥ 3.10 (pre-installed on Ubuntu 22.04+) |
| Docker         | ≥ 24 |
| docker compose | v2+  |

### Option A — One-line installer (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_USER/ros2-docker-gen/main/install.sh | bash
```

The script will:
1. Check for Python 3.10+ (already present on Ubuntu 22.04/24.04 — no install needed)
2. Copy the tool to `/usr/local/lib/ros2-docker-gen/`
3. Create a `/usr/local/bin/ros2-docker-gen` symlink

### Option B — Clone and install locally

```bash
git clone https://github.com/YOUR_USER/ros2-docker-gen.git
cd ros2-docker-gen
./install.sh
```

### Option C — Run directly without installing

```bash
git clone https://github.com/YOUR_USER/ros2-docker-gen.git
cd ros2-docker-gen
python3 bin/ros2-docker-gen
```

---

## 🚀 Usage

```bash
ros2-docker-gen          # start the interactive wizard
ros2-docker-gen --help   # show help
ros2-docker-gen --version
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
ros2-docker-gen/
├── bin/
│   └── ros2-docker-gen     ← executable entry point (Python)
├── src/
│   ├── core.py             ← Python renderer — used by CLI
│   └── core.js             ← JavaScript renderer — used by web UI
├── data/
│   └── config.json         ← single source of truth (all rules and package data)
├── tests/
│   └── test_parity.py      ← ensures core.py and core.js produce identical output
├── install.sh
└── README.md
```

### How it works

All package knowledge — which distros exist, which packages map to which apt names,
which packages skip on certain distros, what environment variables to set — lives in
`data/config.json`. Neither `core.py` nor `core.js` contain hardcoded rules; they
only read the config and render output strings from it.

This means the web UI and CLI share the same knowledge base. To add a new package
or distro, you edit `config.json` once and both tools update automatically.

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

- [ROS2 Docker Generator Web UI](https://your-site.com) — same config.json, browser-based
- [OSRF ROS Docker images](https://hub.docker.com/r/osrf/ros)
- [ROS2 documentation](https://docs.ros.org)

---

## License

MIT
