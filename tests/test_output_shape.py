#!/usr/bin/env python3
import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
SRC = ROOT / "src"
sys.path.insert(0, str(SRC))

from ros2_dockergen.core import GeneratorCore


def assert_contains(text, needle, label):
    if needle not in text:
        raise AssertionError(f"{label}: expected to find {needle!r}")


def assert_not_contains(text, needle, label):
    if needle in text:
        raise AssertionError(f"{label}: did not expect to find {needle!r}")


def main():
    config_path = SRC / "ros2_dockergen" / "data" / "config.json"
    with open(config_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    core = GeneratorCore(cfg)

    dev_cfg = {
        "distro": "jazzy",
        "variant": "desktop",
        "packages": {"cv_bridge", "cyclone_dds", "cuda", "tensorrt"},
        "tools": {"colcon", "rosdep", "python3", "git", "bashrc", "locale", "sudo", "zsh", "x11"},
        "user_type": "user",
        "username": "ros-dev",
        "uid": 1000,
        "workspace": "/home/ros-dev/ros2_ws",
        "container_name": "ros2-jazzy",
    }

    root_cfg = {
        "distro": "humble",
        "variant": "ros-base",
        "packages": set(),
        "tools": {"bashrc", "locale"},
        "user_type": "root",
        "username": "root",
        "uid": 0,
        "workspace": "/root/ros2_ws",
        "container_name": "ros2-humble",
    }

    dockerfile = core.build_dockerfile(dev_cfg)
    compose = core.build_compose(dev_cfg)
    readme = core.build_readme(dev_cfg)
    root_readme = core.build_readme(root_cfg)

    if core.default_container_name("jazzy") != "ros2-jazzy":
        raise AssertionError("default container name should resolve to ros2-jazzy")

    assert_contains(compose, "      - .:/home/ros-dev/ros2_ws:rw", "compose")
    assert_not_contains(compose, "./ros2_ws:", "compose")

    assert_contains(dockerfile, 'RUN echo "source /opt/ros/jazzy/setup.bash" >> /home/ros-dev/.bashrc', "dockerfile")
    assert_contains(dockerfile, 'RUN echo "source /opt/ros/jazzy/setup.bash" >> /home/ros-dev/.zshrc', "dockerfile")
    assert_contains(dockerfile, 'RUN export HOME=/home/ros-dev && sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended', "dockerfile")
    assert_contains(dockerfile, "    tensorrt \\", "dockerfile")
    assert_contains(dockerfile, "    python3-libnvinfer \\", "dockerfile")
    assert_contains(dockerfile, "ENV NVIDIA_VISIBLE_DEVICES=all", "dockerfile")
    assert_contains(dockerfile, "ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility,graphics", "dockerfile")

    user_idx = dockerfile.index("USER ros-dev")
    zsh_idx = dockerfile.index('RUN export HOME=/home/ros-dev && sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended')
    if zsh_idx < user_idx:
        raise AssertionError("dockerfile: Oh My Zsh install must happen after USER ros-dev")

    assert_contains(readme, "This setup mounts the current directory into `/home/ros-dev/ros2_ws`", "readme")
    assert_contains(readme, "## GPU Requirements", "readme")
    assert_contains(readme, "| **Packages** | CUDA, cv_bridge, CycloneDDS, TensorRT |", "readme package summary")
    assert_contains(root_readme, "| **User** | root |", "root readme")

    bad_cfg = copy.deepcopy(cfg)
    del bad_cfg["ros_packages"]["tensorrt"]["apt_by_distros"]["jazzy"]
    bad_core = GeneratorCore(bad_cfg)
    try:
        bad_core.build_dockerfile(dev_cfg)
    except ValueError as exc:
        assert_contains(str(exc), "tensorrt", "unsupported TensorRT error")
    else:
        raise AssertionError("expected unsupported TensorRT distro to raise ValueError")

    print("Output shape tests passed.")


if __name__ == "__main__":
    main()
