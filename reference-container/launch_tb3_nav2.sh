#!/bin/bash
set -e

# Source the ROS 2 setup
source /opt/ros/humble/setup.bash

echo "Starting Turtlebot3 Simulation with Nav2..."
echo "Model: $TURTLEBOT3_MODEL"

# Graphics and Networking Setup
export LIBGL_ALWAYS_SOFTWARE=1
export GZ_IP=127.0.0.1
export OGRE_RTT_MODE=Copy

# Ensure DISPLAY is set (default to host.docker.internal if not set)
export DISPLAY=${DISPLAY:-host.docker.internal:0.0}

echo "Starting Simulation with DISPLAY=$DISPLAY"
echo "Model: $TURTLEBOT3_MODEL"

# Simple connectivity test
if ! timeout 1s bash -c "true > /dev/tcp/${DISPLAY%:*} /dev/null" 2>/dev/null; then
    echo "Warning: Cannot reach X server at ${DISPLAY%:*}. If GUI fails, check VcXsrv 'Disable access control'."
fi

# Launch the TB3 simulation with Nav2
ros2 launch nav2_bringup tb3_simulation_launch.py \
    turtlebot3_model:=$TURTLEBOT3_MODEL \
    headless:=False \
    use_simulator:=True
