# Jetson Tester Instructions

These instructions are for testing the configurations available on this folder on Jetson hardware.

- Download each one and report back in detail, about the installation process and if it works
- There is a base only image and a desktop image. Test them individually

## Configuration 1: Jetson Orin (JetPack 6 / Humble)
**Target**: NVIDIA Jetson Orin family
**Software**: Ubuntu 22.04 + ROS 2 Humble
**Options**: Desktop-Full + Navigation + SLAM + MoveIt 2 + Gazebo + CUDA/TensorRT + All Dev Tools

### 1. Build (On Linux PC)
```bash
# Setup cross-build tools
sudo apt-get update && sudo apt-get install -y qemu-user-static binfmt-support
docker buildx create --use --name jetson-builder || docker buildx use jetson-builder

# Build the "Kitchen Sink" image
# (Assuming generated Dockerfile is in current directory)
docker buildx build --platform linux/arm64 -t ros2-orin-humble-full:latest --load .
```

### 2. Transfer to Jetson
**Option A: USB Drive (Recommended for large images)**
```bash
# On PC
docker save ros2-orin-humble-full:latest -o orin_image.tar

# Copy orin_image.tar to USB and plug into Jetson

# On Jetson
docker load -i /media/<user>/<usb_name>/orin_image.tar
```

**Option B: SSH Pipe**
```bash
docker save ros2-orin-humble-full:latest | ssh <user>@<jetson_ip> docker load
```

### 3. Run on Jetson
```bash
# Ensure NVIDIA Container Runtime is installed on the Jetson host
docker run --rm --runtime nvidia nvidia/cuda:12.2.2-base-ubuntu22.04 nvidia-smi

# Launch the container
docker compose up -d
docker exec -it ros2-orin-full bash

# Inside the container, verify GPU
nvidia-smi
ros2 run demo_nodes_cpp talker
```

---

## Configuration 2: Jetson Orin (JetPack 6 / Jazzy)
**Target**: NVIDIA Jetson Orin family
**Software**: Ubuntu 22.04 + ROS 2 Jazzy
**Options**: Desktop-Full + Navigation + SLAM + MoveIt 2 + Gazebo + CUDA/TensorRT + All Dev Tools

### 1. Build (On Linux PC)
```bash
docker buildx build --platform linux/arm64 -t ros2-orin-jazzy-full:latest --load .
```

### 2. Transfer to Jetson
(Same steps as Orin)

### 3. Run on Jetson
(Same steps as Orin, noting that JetPack 7 uses CUDA 12.6+)

---

## What to Check (Tester Checklist)
1. [ ] Does `nvidia-smi` show the GPU?
2. [ ] Can you launch `rviz2` (if display is connected)?
3. [ ] Can you run `colcon build` on a sample workspace?
4. [ ] Are there any "Package not found" errors during the build phase?
