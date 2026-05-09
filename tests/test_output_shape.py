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

    gazebo_cfg = {
        "distro": "humble",
        "variant": "desktop-full",
        "packages": {"gazebo"},
        "tools": {"colcon", "rosdep", "python3", "git", "locale", "bashrc", "zsh", "x11"},
        "user_type": "user",
        "username": "sim",
        "uid": 1000,
        "workspace": "/home/sim/ws",
        "container_name": "ros2-humble-gazebo",
    }

    dockerfile = core.build_dockerfile(dev_cfg)
    compose = core.build_compose(dev_cfg)
    readme = core.build_readme(dev_cfg)
    root_readme = core.build_readme(root_cfg)
    gazebo_dockerfile = core.build_dockerfile(gazebo_cfg)
    gazebo_compose = core.build_compose(gazebo_cfg)

    pi_cfg = core.resolve_config({
        "host_os": "raspberry-pi-arm64",
        "distro": "jazzy",
        "variant": "desktop",
        "packages": ["cuda", "tensorrt"],
        "tools": ["colcon", "rosdep", "python3", "git", "locale", "bashrc"],
        "user_type": "user",
        "username": "pi",
        "uid": 1000,
        "workspace": "/home/pi/ros2_ws",
        "container_name": "ros2-pi",
    })
    jetson_cfg = core.resolve_config({
        "host_os": "jetson-orin-jetpack6-arm64",
        "distro": "jazzy",
        "variant": "desktop",
        "packages": ["cuda", "tensorrt"],
        "tools": ["colcon", "rosdep", "python3", "git", "locale", "bashrc"],
        "user_type": "user",
        "username": "jetson",
        "uid": 1000,
        "workspace": "/home/jetson/ros2_ws",
        "container_name": "ros2-jetson",
    })
    pi_dockerfile = core.build_dockerfile(pi_cfg)
    pi_compose = core.build_compose(pi_cfg)
    pi_readme = core.build_readme(pi_cfg)
    jetson_dockerfile = core.build_dockerfile(jetson_cfg)
    jetson_compose = core.build_compose(jetson_cfg)
    jetson_readme = core.build_readme(jetson_cfg)

    if core.default_container_name("jazzy") != "ros2-jazzy":
        raise AssertionError("default container name should resolve to ros2-jazzy")

    resolved_defaults = core.resolve_config({
        "distro": "jazzy",
        "variant": "desktop-full",
        "host_os": "linux",
        "packages": [],
        "tools": [],
    })
    if set(resolved_defaults["packages"]) != {"rviz2", "gz_sim"}:
        raise AssertionError("desktop-full should imply rviz2 and jazzy's Gazebo package")
    if "x11" not in resolved_defaults["tools"]:
        raise AssertionError("GUI package implications should also enable x11")

    assert_contains(compose, "      - .:/home/ros-dev/ros2_ws:rw", "compose")
    assert_not_contains(compose, "./ros2_ws:", "compose")

    assert_contains(dockerfile, 'RUN echo "source /opt/ros/jazzy/setup.bash" >> /home/ros-dev/.bashrc', "dockerfile")
    assert_contains(dockerfile, 'RUN echo "source /opt/ros/jazzy/setup.bash" >> /home/ros-dev/.zshrc', "dockerfile")
    assert_contains(dockerfile, 'RUN export HOME=/home/ros-dev && sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended', "dockerfile")
    assert_contains(dockerfile, "    tensorrt \\", "dockerfile")
    assert_contains(dockerfile, "    python3-libnvinfer \\", "dockerfile")
    assert_contains(dockerfile, "ENV NVIDIA_VISIBLE_DEVICES=all", "dockerfile")
    assert_contains(dockerfile, "ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility,graphics", "dockerfile")
    assert_contains(gazebo_dockerfile, "ENV GAZEBO_PLUGIN_PATH=$GAZEBO_PLUGIN_PATH:/opt/ros/humble/lib", "gazebo dockerfile env")
    assert_contains(gazebo_dockerfile, "RUN echo 'export GAZEBO_PLUGIN_PATH=$GAZEBO_PLUGIN_PATH:/opt/ros/humble/lib' >> /home/sim/.bashrc", "gazebo bashrc export")
    assert_contains(gazebo_dockerfile, "RUN echo 'export GAZEBO_PLUGIN_PATH=$GAZEBO_PLUGIN_PATH:/opt/ros/humble/lib' >> /home/sim/.zshrc", "gazebo zshrc export")
    assert_contains(gazebo_compose, "      - GAZEBO_PLUGIN_PATH=$GAZEBO_PLUGIN_PATH:/opt/ros/humble/lib", "gazebo compose env")

    user_idx = dockerfile.index("USER ros-dev")
    zsh_idx = dockerfile.index('RUN export HOME=/home/ros-dev && sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended')
    if zsh_idx < user_idx:
        raise AssertionError("dockerfile: Oh My Zsh install must happen after USER ros-dev")

    assert_contains(readme, "## Run", "readme run heading")
    assert_contains(readme, "## Notes", "readme notes")
    assert_contains(readme, "## What's Inside", "readme should have what's inside table")
    assert_contains(root_readme, "docker exec -it ros2-humble bash", "root readme run command")
    assert_contains(pi_dockerfile, "FROM ros:jazzy-ros-base", "pi dockerfile base")
    assert_contains(pi_dockerfile, "    ros-jazzy-desktop \\", "pi desktop apt upgrade")
    assert_contains(pi_compose, "    platform: linux/arm64", "pi compose platform")
    assert_not_contains(pi_dockerfile, "nvidia/cuda", "pi should not use cuda base")
    assert_not_contains(pi_compose, "runtime: nvidia", "pi should not use nvidia runtime")
    if {"cuda", "tensorrt"} & set(pi_cfg["packages"]):
        raise AssertionError("raspberry pi target should remove NVIDIA packages")
    assert_contains(pi_readme, "## Build ARM64 Image", "pi readme cross build")

    assert_contains(jetson_dockerfile, "FROM ros:jazzy-ros-base", "jetson dockerfile base")
    assert_contains(jetson_dockerfile, "ENV NVIDIA_VISIBLE_DEVICES=all", "jetson nvidia env")
    assert_contains(jetson_compose, "    platform: linux/arm64", "jetson compose platform")
    assert_contains(jetson_compose, "    runtime: nvidia", "jetson compose runtime")
    assert_not_contains(jetson_dockerfile, "nvidia/cuda", "jetson should not use generic cuda base")
    assert_contains(jetson_readme, "## Notes", "jetson notes")
    assert_contains(jetson_readme, "JetPack 6 is Ubuntu 22.04 based", "jetson warning text")
    assert_contains(jetson_readme, "## Build ARM64 Image", "jetson cross build")

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
