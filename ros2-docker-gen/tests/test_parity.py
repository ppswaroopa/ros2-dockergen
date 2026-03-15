"""
Parity test: identical configs through core.py and core.js → identical output.
Run:  python3 tests/test_parity.py
"""
import json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "src"))
from core import GeneratorCore

CASES = [
    {"name": "jazzy / ros-base / nav2+rviz2 / non-root", "config": {
        "distro": "jazzy", "variant": "ros-base",
        "packages": {"nav2", "rviz2"},
        "tools": {"colcon", "rosdep", "python3", "git", "locale", "bashrc"},
        "user_type": "user", "username": "ros", "uid": 1000,
        "workspace": "/ros2_ws", "container_name": "ros2-jazzy"}},
    {"name": "humble / desktop-full / turtlebot3+gazebo+slam / root", "config": {
        "distro": "humble", "variant": "desktop-full",
        "packages": {"turtlebot3", "gazebo", "slam_toolbox"},
        "tools": {"colcon", "rosdep", "python3", "git", "cmake", "x11", "locale", "bashrc"},
        "user_type": "root", "username": "root", "uid": 0,
        "workspace": "/ros2_ws", "container_name": "ros2-humble"}},
    {"name": "jazzy / ros-base / cuda+tensorrt+cv_bridge / non-root", "config": {
        "distro": "jazzy", "variant": "ros-base",
        "packages": {"cuda", "tensorrt", "cv_bridge"},
        "tools": {"colcon", "rosdep", "python3", "git", "locale", "bashrc"},
        "user_type": "user", "username": "dev", "uid": 1000,
        "workspace": "/ws", "container_name": "ros2-jazzy-cuda"}},
    {"name": "humble / ros-core / cyclone_dds / ssh+sudo+zsh", "config": {
        "distro": "humble", "variant": "ros-core",
        "packages": {"cyclone_dds"},
        "tools": {"colcon", "rosdep", "git", "ssh", "sudo", "zsh", "locale", "bashrc"},
        "user_type": "user", "username": "robot", "uid": 1001,
        "workspace": "/home/robot/ws", "container_name": "ros2-humble-ssh"}},
    {"name": "kilted / ros-base / no packages / defaults", "config": {
        "distro": "kilted", "variant": "ros-base",
        "packages": set(),
        "tools": {"colcon", "rosdep", "python3", "git", "locale", "bashrc"},
        "user_type": "user", "username": "ros", "uid": 1000,
        "workspace": "/ros2_ws", "container_name": "ros2-kilted"}},
    {"name": "jazzy / desktop / moveit2+pcl+tf2 / x11+gdb+tmux", "config": {
        "distro": "jazzy", "variant": "desktop",
        "packages": {"moveit2", "ros2_control", "pcl", "tf2"},
        "tools": {"colcon", "rosdep", "python3", "git", "cmake", "gdb", "tmux",
                  "x11", "net_tools", "locale", "bashrc", "sudo"},
        "user_type": "user", "username": "dev", "uid": 1000,
        "workspace": "/dev_ws", "container_name": "ros2-jazzy-dev"}},
]

# The JS runner — Native ESM version
RUNNER_PATH = ROOT / "tests" / "_runner.js"
RUNNER_PATH.write_text(
    "import * as CORE from '../src/core.js';\n"
    "import fs from 'fs';\n"
    "import path from 'path';\n"
    "import { fileURLToPath } from 'url';\n"
    "const __dirname = path.dirname(fileURLToPath(import.meta.url));\n"
    "const R = path.join(__dirname, '..');\n"
    "const config = JSON.parse(fs.readFileSync(path.join(R, 'data', 'config.json'), 'utf8'));\n"
    "CORE.init(config);\n"
    "const raw = JSON.parse(process.argv[2]);\n"
    "const cfg = {\n"
    "    ...raw,\n"
    "    packages:      raw.packages,\n"
    "    tools:         raw.tools,\n"
    "    containerName: raw.container_name,\n"
    "    userType:      raw.user_type,\n"
    "};\n"
    "process.stdout.write(JSON.stringify({\n"
    "    dockerfile: CORE.buildDockerfile(cfg),\n"
    "    compose:    CORE.buildCompose(cfg),\n"
    "    readme:     CORE.buildReadme(cfg),\n"
    "}));\n"
)

def run_js(config):
    payload = {**config, "packages": sorted(config["packages"]), "tools": sorted(config["tools"])}
    r = subprocess.run(["node", str(RUNNER_PATH), json.dumps(payload)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"node exited {r.returncode}:\n{r.stderr.strip()}")
    return json.loads(r.stdout)

def run_py(config):
    core = GeneratorCore.from_file(ROOT / "data" / "config.json")
    return {"dockerfile": core.build_dockerfile(config),
            "compose":    core.build_compose(config),
            "readme":     core.build_readme(config)}

def first_diff(a, b, label):
    if a == b: return None
    al, bl = a.splitlines(), b.splitlines()
    for i, (x, y) in enumerate(zip(al, bl), 1):
        if x != y:
            return f"{label} line {i}:\n    PY: {x!r}\n    JS: {y!r}"
    return f"{label}: line counts differ (py={len(al)}, js={len(bl)})"

def run_all():
    passed = failed = 0
    for case in CASES:
        print(f"  {case['name']} ...", end="", flush=True)
        try:
            py = run_py(case["config"])
            js = run_js(case["config"])
            diffs = [d for d in (first_diff(py[k], js[k], k) for k in ("dockerfile","compose","readme")) if d]
            if diffs:
                print(" FAIL"); [print(f"    ✗ {d}") for d in diffs]; failed += 1
            else:
                print(" ok"); passed += 1
        except Exception as e:
            print(f" ERROR\n    {e}"); failed += 1
    print(f"\n  {passed}/{passed+failed} passed", "✓" if not failed else f", {failed} failed ✗")
    return failed == 0

if __name__ == "__main__":
    print("\nParity tests — core.py vs core.js (ESM)\n")
    sys.exit(0 if run_all() else 1)
