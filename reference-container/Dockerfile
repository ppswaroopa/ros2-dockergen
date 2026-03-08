FROM osrf/ros:humble-desktop

# 1. Arguments for flexibility
ARG USERNAME=rosuser
ARG USER_UID=1000
ARG USER_GID=$USER_UID

# 2. Install Essential Development & Graphics Tools
RUN apt-get update && apt-get install -y \
    git \
    nano \
    vim \
    tmux \
    wget \
    curl \
    python3-pip \
    python3-atomicwrites \
    build-essential \
    python3-colcon-common-extensions \
    ssh-client \
    sudo \
    x11-apps \
    mesa-utils \
    iputils-ping \
    # Graphics dependencies for Gazebo/RViz
    libgl1-mesa-glx \
    libgl1-mesa-dri \
    # ROS 2 Middlewares
    ros-humble-rmw-cyclonedds-cpp \
    && rm -rf /var/lib/apt/lists/*

# 3. Install Robotics Stack (Turtlebot3, Nav2, Gazebo)
RUN apt-get update && apt-get install -y \
    ros-humble-turtlebot3-gazebo \
    ros-humble-turtlebot3-simulations \
    ros-humble-turtlebot3-cartographer \
    ros-humble-turtlebot3-navigation2 \
    ros-humble-navigation2 \
    ros-humble-nav2-bringup \
    ros-humble-dynamixel-sdk \
    && rm -rf /var/lib/apt/lists/*

# 4. Create non-root user and setup sudo
RUN groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m $USERNAME \
    && echo $USERNAME ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME

# 5. Environment & Workspace Setup
ENV TURTLEBOT3_MODEL=burger
ENV QT_X11_NO_MITSHM=1
ENV RMW_IMPLEMENTATION=rmw_cyclonedds_cpp
ENV GZ_IP=127.0.0.1
ENV GAZEBO_MODEL_PATH=/home/$USERNAME/.gazebo/models:/opt/ros/humble/share/turtlebot3_gazebo/models:/opt/ros/humble/share/nav2_bringup/worlds
ENV GAZEBO_RESOURCE_PATH=/usr/share/gazebo-11:/home/$USERNAME/.gazebo/models:/opt/ros/humble/share/turtlebot3_gazebo/models
# Common fixes for Gazebo on virtualized displays
ENV OGRE_RTT_MODE=Copy
ENV SVGA_VGPU10=0

USER $USERNAME
WORKDIR /home/$USERNAME/ros2_ws

# 6. Pre-download Gazebo Models to prevent timeout on first run
RUN mkdir -p /home/$USERNAME/.gazebo/models \
    && git clone --depth 1 https://github.com/osrf/gazebo_models /tmp/gazebo_models \
    && mv /tmp/gazebo_models/* /home/$USERNAME/.gazebo/models/ \
    && rm -rf /tmp/gazebo_models


# Pre-source ROS for the user
RUN echo "source /opt/ros/humble/setup.bash" >> ~/.bashrc

# Copy entrypoint and launch scripts
COPY --chown=$USERNAME:$USERNAME entrypoint.sh /entrypoint.sh
COPY --chown=$USERNAME:$USERNAME launch_tb3_nav2.sh /home/$USERNAME/launch_tb3_nav2.sh
RUN chmod +x /entrypoint.sh /home/$USERNAME/launch_tb3_nav2.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["bash"]

