# ROS 2 Humble Reference Container (Turtlebot3 + Nav2)

This repository provides a ready-to-use Docker environment for ROS 2 Humble development, specifically pre-configured for **Turtlebot3** simulations and **Navigation2**.

## 🚀 Features
- **ROS 2 Humble Desktop** base.
- **Turtlebot3** (Burger) & **Nav2** pre-installed.
- **X11 Forwarding** configured for Gazebo/RViz2.
- **Cyclone DDS** configured for reliable communication.
- **VS Code DevContainer** support.
- **Non-root user** (`rosuser`) for secure development.

## 🛠️ Prerequisites
- **Docker** and **Docker Compose**.
- **X11 Server** for GUI (Gazebo/RViz):
  - **Linux**: No extra software needed.
  - **Windows**: [VcXsrv](https://sourceforge.net/projects/vcxsrv/) or WSL2 with WSLg.
  - **macOS**: [XQuartz](https://www.xquartz.org/).

## 🏃 Quick Start

### 1. Build the Container
```bash
docker-compose build
```

### 2. Run the Container
```bash
docker-compose up -d
docker exec -it ros2_playground bash
```

### 3. Launch Turtlebot3 + Nav2
Inside the container terminal:
```bash
./launch_tb3_nav2.sh
```

## 🖥️ GUI Setup (X11 Forwarding)

### Windows (WSL2 / Docker Desktop)
1.  **Install VcXsrv**: Download from [SourceForge](https://sourceforge.net/projects/vcxsrv/).
2.  **Launch via XLaunch**:
    *   Select "Multiple windows" -> "Start no client".
    *   **CRITICAL**: Check **"Disable access control"**.
    *   If Gazebo is slow/black, try toggling "Native OpenGL".

## 🛠️ Troubleshooting

*   **GUI doesn't open?** Run `glxgears` inside the container. If it fails, VcXsrv is likely blocked by your firewall or "Disable access control" was not checked.
*   **Gazebo stuck on black screen?** Resize the Gazebo window with your mouse. Sometimes the X11 buffer on Windows needs a resize event to refresh the first frame.
*   **Robot not spawning?** Ensure `TURTLEBOT3_MODEL` is set to `burger` (default) or `waffle`.

## 📝 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
