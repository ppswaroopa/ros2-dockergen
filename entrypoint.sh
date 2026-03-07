#!/bin/bash
set -e

# Source ROS 2 Humble
source /opt/ros/humble/setup.bash

# Ensure setup.bash is sourced in future interactive shells
if [ ! -f ~/.bashrc_sourced ]; then
    echo "source /opt/ros/humble/setup.bash" >> ~/.bashrc
    touch ~/.bashrc_sourced
fi

exec "$@"
