# ROS 2 Humble Reference Container

A pre-configured Docker environment for **ROS 2 Humble** — built for rapid learning and professional development.

## Use Cases

**🎯 Rapid Learning & Testing** — Spin up a TurtleBot3 + Nav2 simulation instantly, with no workspace setup required. Ideal for testing algorithms in isolation, learning ROS 2 / Nav2 concepts hands-on, and verifying your X11/GUI pipeline.

**🛠️ Professional Development** — A full-featured foundation for production ROS 2 work that keeps your host OS clean. Ships with `colcon`, `git`, `python3-pip`, `build-essential`, and `mesa-utils` pre-installed. Code persists via a host-mapped `./src` folder, with full VS Code DevContainer support.

## Workspace Structure

```
./src/               ← your ROS 2 packages
Dockerfile           ← container definition
docker-compose.yml   ← orchestration config
launch_tb3_nav2.sh   ← one-shot simulation launcher
```

## Getting Started

**1. Build and enter the container**

```bash
# from the project root
docker-compose up --build -d
docker exec -it ros2_playground bash
```

**2. Launch the reference simulation (TurtleBot3 + Nav2)**

```bash
# inside the container
cd .. && ./launch_tb3_nav2.sh
```

**3. Develop your own packages**

Drop packages into `./src` on your host, then inside the container:

```bash
colcon build
source install/setup.bash
```

## VS Code — Dev Container

1. Install the **Dev Containers** extension in VS Code.
2. Open this project folder, then via `Ctrl+Shift+P` select **Dev Containers: Reopen in Container**.

This gives you full `rclcpp` / `rclpy` IntelliSense with zero configuration, and a terminal that opens directly inside the container as `rosuser`.

## GUI Setup — X11 Forwarding (Windows / WSL2)

1. **Install VcXsrv** — download from [sourceforge.net/projects/vcxsrv](https://sourceforge.net/projects/vcxsrv/).
2. **Configure XLaunch** — select *Multiple windows* → *Start no client*.
   > ⚠️ **Critical:** Check **Disable access control**. Without this, GUI windows will be refused. If Gazebo renders a black screen, toggle *Native OpenGL*.
3. **Verify the bridge** — run `glxgears` inside the container. A spinning gears window confirms X11 is working.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Black screen in Gazebo | Resize the window with your mouse to force a framebuffer refresh. |
| Connection refused / denied | Ensure VcXsrv is running with *Disable access control* checked. |
| GUI not rendering | Run `glxgears` inside the container to test the X11 bridge. |

## License

MIT — see [LICENSE](LICENSE).
