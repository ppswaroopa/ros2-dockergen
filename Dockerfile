FROM osrf/ros:humble-desktop

# 1. Install Development Tools
RUN apt-get update && apt-get install -y \
    git \
    nano \
    vim \
    tmux \
    wget \
    curl \
    python3-pip \
    build-essential \
    python3-colcon-common-extensions \
    ssh-client \
    && rm -rf /var/lib/apt/lists/*

# 2. Install Robotics Stack (Burger, Nav2, Gazebo)
RUN apt-get update && apt-get install -y \
    ros-humble-turtlebot3-gazebo \
    ros-humble-turtlebot3-simulations \
    ros-humble-navigation2 \
    ros-humble-nav2-bringup \
    && rm -rf /var/lib/apt/lists/*

# 3. Environment Setup
ENV TURTLEBOT3_MODEL=burger
ENV QT_X11_NO_MITSHM=1

# Auto-source ROS and setup a clean workspace
RUN echo "source /opt/ros/humble/setup.bash" >> ~/.bashrc
WORKDIR /ros2_ws

CMD ["bash"]
