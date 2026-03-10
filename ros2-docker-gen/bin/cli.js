#!/usr/bin/env node

/**
 * ros2-docker-gen — Self-contained interactive CLI.
 * Zero external dependencies — pure Node.js stdlib.
 *
 * Usage:
 *   ros2-docker-gen              Start interactive wizard
 *   ros2-docker-gen --help       Show help
 *   ros2-docker-gen --version    Show version
 */

import readline from 'readline';
import fs from 'fs';
import path from 'path';

const VERSION = '1.0.0';

// ─── ANSI helpers (zero deps) ─────────────────────────────────────────────────

const tty = process.stdout.isTTY;
const C = {
    bold: s => tty ? `\x1b[1m${s}\x1b[0m` : s,
    dim: s => tty ? `\x1b[2m${s}\x1b[0m` : s,
    cyan: s => tty ? `\x1b[36m${s}\x1b[0m` : s,
    green: s => tty ? `\x1b[32m${s}\x1b[0m` : s,
    yellow: s => tty ? `\x1b[33m${s}\x1b[0m` : s,
    magenta: s => tty ? `\x1b[35m${s}\x1b[0m` : s,
    red: s => tty ? `\x1b[31m${s}\x1b[0m` : s,
    underline: s => tty ? `\x1b[4m${s}\x1b[0m` : s,
    gray: s => tty ? `\x1b[90m${s}\x1b[0m` : s,
};

// ─── --help / --version ───────────────────────────────────────────────────────

function printHelp() {
    console.log(`
${C.bold('ros2-docker-gen')} v${VERSION}
Generate a Dockerfile, docker-compose.yml and README for a ROS2 project.

${C.bold('USAGE')}
  ros2-docker-gen            Run the interactive wizard
  ros2-docker-gen --help     Show this help message
  ros2-docker-gen --version  Print the version number

${C.bold('WIZARD STEPS')}
  1. ROS2 distro      — Jazzy (Ubuntu 24.04), Humble (22.04), Kilted
  2. Base variant     — ros-core / ros-base / desktop / desktop-full
  3. ROS2 packages    — Nav2, MoveIt2, SLAM, RViz2, TurtleBot3, CUDA, …
  4. Dev tools        — colcon, rosdep, cmake, git, tmux, zsh, x11, …
  5. User setup       — root or non-root with custom username / UID
  6. Workspace path   — absolute path inside the container
  7. Container name   — used for docker-compose service name
  8. Output directory — where the generated files are written

${C.bold('NAVIGATION')}
  Enter               Accept the shown default value
  Numbers e.g. 1,3,5 Select items in a multi-choice list
  a                   Select all items
  n                   Select no items (skip)
  q                   Quit the wizard at any prompt — no files are written

${C.bold('OUTPUT')}
  Dockerfile          Multi-stage image definition
  docker-compose.yml  Service definition with volumes, env, GPU/SSH/X11
  README.md           Quick-start guide for the generated setup

${C.bold('EXAMPLES')}
  # Basic run
  ros2-docker-gen

  # Install from a cloned repo and run
  ./install.sh
  ros2-docker-gen
`);
}

function printVersion() {
    console.log(VERSION);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) { printHelp(); process.exit(0); }
if (args.includes('--version') || args.includes('-v')) { printVersion(); process.exit(0); }

// ─── Quit signal ──────────────────────────────────────────────────────────────

class QuitSignal extends Error { constructor() { super('quit'); this.name = 'QuitSignal'; } }

function quit() {
    _rl.close();
    console.log(C.yellow('\n  Wizard cancelled — no files were written.'));
    process.exit(0);
}

// ─── Prompt utilities ─────────────────────────────────────────────────────────

// Single shared readline interface — keeps stdin open across all questions.
// Creating a new interface per question closes the underlying stream on Node 18+.
const _rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdout.isTTY,
});
const _lineQueue = [];   // lines buffered before a waiter arrives
const _waiters = [];   // resolve callbacks waiting for the next line
let _rlClosed = false;

_rl.on('line', line => {
    if (_waiters.length) _waiters.shift()(line);
    else _lineQueue.push(line);
});
_rl.on('close', () => {
    _rlClosed = true;
    // Wake any pending waiters with null so they can reject
    while (_waiters.length) _waiters.shift()(null);
});

function _readLine() {
    return new Promise(resolve => {
        if (_lineQueue.length) return resolve(_lineQueue.shift());
        if (_rlClosed) return resolve(null);
        _waiters.push(resolve);
    });
}

/**
 * Ask a single question.
 * Returns the trimmed answer, or defaultVal on bare Enter.
 * Throws QuitSignal when the user types 'q' or hits Ctrl-C / EOF.
 */
async function ask(prompt, defaultVal = '') {
    const hint = defaultVal ? C.dim(` [${defaultVal}]`) : '';
    const qhint = C.gray('  (q to quit)');
    process.stdout.write(`${prompt}${hint}${qhint} › `);
    const line = await _readLine();
    if (line === null) throw new QuitSignal();          // Ctrl-C / EOF
    const answer = line.trim();
    if (answer.toLowerCase() === 'q') throw new QuitSignal();
    return answer || defaultVal;
}

/**
 * Single-choice numbered list.
 * Prints a section header with step number and purpose text.
 */
async function selectOne(stepLabel, purpose, choices) {
    console.log(`\n${C.bold(stepLabel)}`);
    console.log(C.dim(`  ${purpose}`));
    console.log('');
    choices.forEach((c, i) => {
        console.log(`  ${C.cyan(String(i + 1).padStart(2) + '.')}  ${c.name}`);
    });
    console.log('');
    while (true) {
        let raw;
        try { raw = await ask(C.dim(`  Enter 1–${choices.length}`), '1'); }
        catch (e) { if (e instanceof QuitSignal) quit(); throw e; }
        const idx = parseInt(raw, 10) - 1;
        if (idx >= 0 && idx < choices.length) return choices[idx].value;
        console.log(C.red(`  ✗  Please enter a number between 1 and ${choices.length}`));
    }
}

/**
 * Multi-choice numbered list with toggleable defaults.
 * Accepts: comma list, 'a' (all), 'n' (none), Enter (keep defaults).
 */
async function selectMany(stepLabel, purpose, choices) {
    const defaults = choices.map((c, i) => c.checked ? i + 1 : null).filter(Boolean);
    console.log(`\n${C.bold(stepLabel)}`);
    console.log(C.dim(`  ${purpose}`));
    console.log('');
    choices.forEach((c, i) => {
        const bullet = c.checked ? C.green('●') : C.dim('○');
        console.log(`  ${bullet} ${C.cyan(String(i + 1).padStart(2) + '.')}  ${c.name}`);
    });
    console.log('');
    console.log(C.dim('  ● = selected by default'));
    console.log(C.dim('  Enter numbers separated by commas e.g. 1,4,7'));
    console.log(C.dim('  a = select all   n = select none   Enter = keep defaults'));
    console.log('');
    while (true) {
        let raw;
        try { raw = await ask(C.dim('  Selection'), defaults.length ? defaults.join(',') : 'n'); }
        catch (e) { if (e instanceof QuitSignal) quit(); throw e; }
        if (raw.toLowerCase() === 'a') return choices.map(c => c.value);
        if (raw.toLowerCase() === 'n') return [];
        const nums = raw.split(',').map(s => parseInt(s.trim(), 10));
        if (nums.every(n => !isNaN(n) && n >= 1 && n <= choices.length)) {
            return [...new Set(nums)].map(n => choices[n - 1].value);
        }
        console.log(C.red(`  ✗  Use comma-separated numbers 1–${choices.length}, 'a', or 'n'`));
    }
}

/** Yes/no confirm. */
async function confirm(question, def = false) {
    const hint = def ? 'Y/n' : 'y/N';
    let raw;
    try { raw = await ask(`${C.bold(question)} ${C.dim(`[${hint}]`)}`, def ? 'y' : 'n'); }
    catch (e) { if (e instanceof QuitSignal) quit(); throw e; }
    return raw.toLowerCase().startsWith('y');
}

/** Free-text input with optional validator. */
async function input(stepLabel, purpose, defaultVal, validate) {
    if (purpose) {
        console.log(`\n${C.bold(stepLabel)}`);
        console.log(C.dim(`  ${purpose}`));
    }
    while (true) {
        let raw;
        try { raw = await ask(purpose ? '' : C.bold(stepLabel), defaultVal); }
        catch (e) { if (e instanceof QuitSignal) quit(); throw e; }
        if (validate) {
            const err = validate(raw);
            if (err !== true) { console.log(C.red(`  ✗  ${err}`)); continue; }
        }
        return raw;
    }
}

// ─── Choice definitions ───────────────────────────────────────────────────────

const DISTROS = [
    { name: 'Jazzy   — Ubuntu 24.04 LTS  (recommended)', value: 'jazzy' },
    { name: 'Humble  — Ubuntu 22.04 LTS', value: 'humble' },
    { name: 'Kilted  — Ubuntu 24.04', value: 'kilted' },
];

const VARIANTS = [
    { name: 'ros-core      Minimal — no GUI, just the core ROS2 libraries', value: 'ros-core' },
    { name: 'ros-base      Core + basic CLI tools (rcl, rclcpp, common pkgs)', value: 'ros-base' },
    { name: 'desktop       Full desktop stack — rqt, RViz2, demos included', value: 'desktop' },
    { name: 'desktop-full  Desktop + extra simulation demos and sensor packages', value: 'desktop-full' },
];

const PACKAGES = [
    { name: 'Nav2            Autonomous navigation stack', value: 'nav2' },
    { name: 'SLAM Toolbox    2D/3D mapping and localisation', value: 'slam_toolbox' },
    { name: 'Cartographer    Google SLAM — lidar-based mapping', value: 'cartographer' },
    { name: 'Gazebo Classic  Classic simulation (Humble only)', value: 'gazebo' },
    { name: 'Gazebo (gz-sim) Modern Gazebo — Jazzy / Kilted', value: 'gz_sim' },
    { name: 'RViz2           3D visualisation tool', value: 'rviz2' },
    { name: 'TurtleBot3      TB3 robot packages + simulations', value: 'turtlebot3' },
    { name: 'MoveIt2         Motion planning and manipulation', value: 'moveit2' },
    { name: 'ros2_control    Hardware abstraction and controllers', value: 'ros2_control' },
    { name: 'PCL             Point-cloud processing library', value: 'pcl' },
    { name: 'cv_bridge       OpenCV ↔ ROS2 image bridge', value: 'cv_bridge' },
    { name: 'TF2             Coordinate transform library', value: 'tf2' },
    { name: 'CycloneDDS      Eclipse Cyclone DDS middleware (alt RMW)', value: 'cyclone_dds' },
    { name: 'ROSBridge       WebSocket bridge for web / remote clients', value: 'rosbridge' },
    { name: 'CUDA            NVIDIA GPU compute (switches base image)', value: 'cuda' },
    { name: 'TensorRT        NVIDIA TensorRT inference engine', value: 'tensorrt' },
];

const TOOLS = [
    { name: 'colcon     ROS2 build system', value: 'colcon', checked: true },
    { name: 'rosdep     Automatic ROS dependency installer', value: 'rosdep', checked: true },
    { name: 'python3    Python 3, pip, venv, setuptools', value: 'python3', checked: true },
    { name: 'git        Git version control', value: 'git', checked: true },
    { name: 'cmake      CMake + gcc/g++ build toolchain', value: 'cmake' },
    { name: 'nano/vim   Terminal text editors', value: 'nano' },
    { name: 'tmux       Terminal multiplexer for multi-pane sessions', value: 'tmux' },
    { name: 'gdb        GNU debugger + gdbserver', value: 'gdb' },
    { name: 'net-tools  Network utilities (ping, curl, wget, …)', value: 'net_tools' },
    { name: 'vcstool    VCS workspace management (vcs import/export)', value: 'vcstool' },
    { name: 'ssh        OpenSSH server (exposes port 22)', value: 'ssh' },
    { name: 'x11        X11 display forwarding for GUI apps', value: 'x11' },
    { name: 'zsh        Zsh shell + Oh-My-Zsh framework', value: 'zsh' },
    { name: 'locale     Configure UTF-8 locale (en_US.UTF-8)', value: 'locale', checked: true },
    { name: 'bashrc     Auto-source /opt/ros/<distro>/setup.bash', value: 'bashrc', checked: true },
    { name: 'sudo       Grant passwordless sudo to the container user', value: 'sudo' },
];

// ─── Step counter ─────────────────────────────────────────────────────────────

const TOTAL_STEPS = 8;
let currentStep = 0;
function step(title) {
    currentStep++;
    const bar = C.cyan(`[${currentStep}/${TOTAL_STEPS}]`);
    const spacer = C.cyan('─'.repeat(52));
    console.log(`\n${spacer}`);
    console.log(`${bar}  ${C.bold(title)}`);
    console.log(spacer);
}

// ─── Inline core generator ────────────────────────────────────────────────────

const CORE = {
    getBaseImage(distro, variant) {
        if (variant === 'ros-base' || variant === 'ros-core') return `ros:${distro}-${variant}`;
        if (variant === 'desktop-full') return `osrf/ros:${distro}-desktop`;
        return `osrf/ros:${distro}-${variant}`;
    },

    getRosPackages(distro, packages) {
        const map = {
            nav2: [`ros-${distro}-navigation2`, `ros-${distro}-nav2-bringup`],
            slam_toolbox: [`ros-${distro}-slam-toolbox`],
            cartographer: [`ros-${distro}-cartographer`, `ros-${distro}-cartographer-ros`],
            gazebo: (distro === 'jazzy' || distro === 'kilted') ? [] : [`ros-${distro}-gazebo-ros-pkgs`, `ros-${distro}-gazebo-ros2-control`],
            gz_sim: [`ros-${distro}-ros-gz`],
            rviz2: [`ros-${distro}-rviz2`, `ros-${distro}-rviz-common`],
            turtlebot3: (distro === 'jazzy' || distro === 'kilted')
                ? [`ros-${distro}-turtlebot3`, `ros-${distro}-turtlebot3-msgs`]
                : [`ros-${distro}-turtlebot3`, `ros-${distro}-turtlebot3-msgs`, `ros-${distro}-turtlebot3-simulations`],
            moveit2: [`ros-${distro}-moveit`],
            ros2_control: [`ros-${distro}-ros2-control`, `ros-${distro}-ros2-controllers`],
            pcl: [`ros-${distro}-perception-pcl`, `ros-${distro}-pcl-ros`],
            cv_bridge: [`ros-${distro}-cv-bridge`, `ros-${distro}-image-transport`, `python3-opencv`],
            tf2: [`ros-${distro}-tf2-tools`, `ros-${distro}-tf-transformations`],
            cyclone_dds: [`ros-${distro}-rmw-cyclonedds-cpp`],
            rosbridge: [`ros-${distro}-rosbridge-suite`],
        };
        const out = [];
        packages.forEach(k => { if (map[k]) out.push(...map[k]); });
        return out.filter(Boolean);
    },

    buildDockerfile(cfg) {
        const { distro, variant, packages, tools, username, uid, workspace, userType } = cfg;
        const isRoot = userType === 'root';
        const ubVer = distro === 'humble' ? 'ubuntu22.04' : 'ubuntu24.04';
        const cudaVer = distro === 'humble' ? '12.3.1' : '12.4.1';
        const hasCuda = packages.has('cuda') || packages.has('tensorrt');
        const from = hasCuda ? `nvidia/cuda:${cudaVer}-devel-${ubVer}` : this.getBaseImage(distro, variant);
        const L = [];

        L.push(`# =============================================================`);
        L.push(`# ROS2 ${distro[0].toUpperCase() + distro.slice(1)} Dockerfile`);
        L.push(`# Generated by ros2-docker-gen v${VERSION}`);
        L.push(`# =============================================================`);
        L.push(''); L.push(`FROM ${from}`); L.push('');

        if (hasCuda) {
            L.push(`# ── Install ROS2 on top of CUDA base ───────────────────────`);
            L.push(`ENV DEBIAN_FRONTEND=noninteractive`);
            L.push(`RUN apt-get update && apt-get install -y \\`);
            L.push(`    curl gnupg2 lsb-release && \\`);
            L.push(`    curl -sSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.key \\`);
            L.push(`    -o /usr/share/keyrings/ros-archive-keyring.gpg && \\`);
            L.push(`    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/ros-archive-keyring.gpg] \\`);
            L.push(`    http://packages.ros.org/ros2/ubuntu $(lsb_release -cs) main" \\`);
            L.push(`    > /etc/apt/sources.list.d/ros2.list && \\`);
            L.push(`    apt-get update && apt-get install -y ros-${distro}-${variant} && \\`);
            L.push(`    rm -rf /var/lib/apt/lists/*`);
            L.push('');
        }

        L.push(`ENV DEBIAN_FRONTEND=noninteractive`);
        L.push(`SHELL ["/bin/bash", "-c"]`); L.push('');

        if (!hasCuda && variant === 'desktop-full') {
            L.push(`# ── Upgrade to desktop-full ─────────────────────────────────`);
            L.push(`RUN apt-get update && apt-get install -y \\`);
            L.push(`    ros-${distro}-desktop-full && \\`);
            L.push(`    rm -rf /var/lib/apt/lists/*`); L.push('');
        }

        if (tools.has('locale')) {
            L.push(`# ── Locale ───────────────────────────────────────────────────`);
            L.push(`RUN apt-get update && apt-get install -y locales && \\`);
            L.push(`    locale-gen en_US en_US.UTF-8 && \\`);
            L.push(`    update-locale LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8 && \\`);
            L.push(`    rm -rf /var/lib/apt/lists/*`);
            L.push(`ENV LANG=en_US.UTF-8`); L.push('');
        }

        const apt = ['software-properties-common', 'apt-transport-https', 'ca-certificates'];
        if (tools.has('python3')) apt.push('python3', 'python3-pip', 'python3-venv', 'python3-setuptools');
        if (tools.has('git')) apt.push('git');
        if (tools.has('cmake')) apt.push('cmake', 'build-essential', 'gcc', 'g++');
        if (tools.has('nano')) apt.push('nano', 'vim');
        if (tools.has('tmux')) apt.push('tmux');
        if (tools.has('gdb')) apt.push('gdb', 'gdbserver');
        if (tools.has('net_tools')) apt.push('net-tools', 'iproute2', 'iputils-ping', 'curl', 'wget');
        if (tools.has('vcstool')) apt.push('python3-vcstool');
        if (tools.has('ssh')) apt.push('openssh-server');
        if (tools.has('x11')) apt.push('x11-apps', 'libx11-dev');
        if (!isRoot) apt.push('sudo');

        L.push(`# ── System packages ──────────────────────────────────────────`);
        L.push(`RUN apt-get update && apt-get install -y \\`);
        apt.forEach(p => L.push(`    ${p} \\`));
        L.push(`    && rm -rf /var/lib/apt/lists/*`); L.push('');

        const bt = [];
        if (tools.has('colcon')) bt.push('python3-colcon-common-extensions', 'python3-colcon-mixin');
        if (tools.has('rosdep')) bt.push('python3-rosdep');
        bt.push('python3-rosinstall-generator');
        L.push(`# ── ROS2 build tools ─────────────────────────────────────────`);
        L.push(`RUN apt-get update && apt-get install -y \\`);
        bt.forEach(p => L.push(`    ${p} \\`));
        L.push(`    && rm -rf /var/lib/apt/lists/*`);
        if (tools.has('rosdep')) L.push(`RUN rosdep init || true && rosdep update --rosdistro ${distro}`);
        L.push('');

        if (tools.has('zsh')) {
            L.push(`# ── Zsh + Oh-My-Zsh ──────────────────────────────────────────`);
            L.push(`RUN apt-get update && apt-get install -y zsh && rm -rf /var/lib/apt/lists/*`);
            L.push(`RUN sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended`);
            L.push('');
        }

        const rosPkgs = this.getRosPackages(distro, packages);
        if (rosPkgs.length) {
            L.push(`# ── ROS2 packages ────────────────────────────────────────────`);
            L.push(`RUN apt-get update && apt-get install -y \\`);
            rosPkgs.forEach(p => L.push(`    ${p} \\`));
            L.push(`    && rm -rf /var/lib/apt/lists/*`); L.push('');
        }

        if (packages.has('cyclone_dds')) { L.push(`ENV RMW_IMPLEMENTATION=rmw_cyclonedds_cpp`); L.push(''); }
        if (packages.has('turtlebot3')) { L.push(`ENV TURTLEBOT3_MODEL=waffle_pi`); L.push(''); }

        if (tools.has('ssh')) {
            L.push(`# ── SSH server ────────────────────────────────────────────────`);
            L.push(`RUN mkdir /var/run/sshd && \\`);
            L.push(`    sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config`);
            L.push(`EXPOSE 22`); L.push('');
        }

        if (!isRoot) {
            L.push(`# ── Non-root user ────────────────────────────────────────────`);
            L.push(`ARG UID=${uid}`); L.push(`ARG GID=${uid}`);
            L.push(`RUN if getent group \${GID} >/dev/null; then \\`);
            L.push(`        groupmod -n ${username} \$(getent group \${GID} | cut -d: -f1); \\`);
            L.push(`    else groupadd -g \${GID} ${username}; fi && \\`);
            L.push(`    if getent passwd \${UID} >/dev/null; then \\`);
            L.push(`        usermod -l ${username} -m -d /home/${username} \$(getent passwd \${UID} | cut -d: -f1); \\`);
            L.push(`    else useradd -m -u \${UID} -g \${GID} -s /bin/bash ${username}; fi`);
            if (tools.has('sudo')) L.push(`RUN echo "${username} ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers`);
            L.push('');
            L.push(`RUN mkdir -p ${workspace}/src && chown -R ${username}:${username} ${workspace}`);
            L.push(''); L.push(`USER ${username}`);
        } else {
            L.push(`RUN mkdir -p ${workspace}/src`);
        }
        L.push(`WORKDIR ${workspace}`); L.push('');

        if (tools.has('bashrc')) {
            const home = isRoot ? '/root' : `/home/${username}`;
            L.push(`# ── Shell setup ───────────────────────────────────────────────`);
            L.push(`RUN echo "source /opt/ros/${distro}/setup.bash" >> ${home}/.bashrc`);
            if (packages.has('cyclone_dds')) L.push(`RUN echo "export RMW_IMPLEMENTATION=rmw_cyclonedds_cpp" >> ${home}/.bashrc`);
            if (packages.has('turtlebot3')) L.push(`RUN echo "export TURTLEBOT3_MODEL=waffle_pi" >> ${home}/.bashrc`);
            L.push('');
        }

        if (tools.has('x11')) { L.push(`ENV DISPLAY=\${DISPLAY:-:0}`); L.push(`ENV QT_X11_NO_MITSHM=1`); L.push(''); }
        if (hasCuda) { L.push(`ENV NVIDIA_VISIBLE_DEVICES=all`); L.push(`ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility,graphics`); L.push(''); }

        L.push(`CMD ["/bin/bash"]`);
        return L.join('\n');
    },

    buildCompose(cfg) {
        const { distro, packages, tools, workspace, containerName, userType } = cfg;
        const isRoot = userType === 'root';
        const hasCuda = packages.has('cuda') || packages.has('tensorrt');
        const hasX11 = tools.has('x11');
        const hasSSH = tools.has('ssh');
        const L = [];
        L.push(`# docker-compose.yml — generated by ros2-docker-gen v${VERSION}`);
        L.push(`services:`); L.push(`  ${containerName}:`);
        L.push(`    build:`); L.push(`      context: .`); L.push(`      dockerfile: Dockerfile`);
        if (!isRoot) { L.push(`      args:`); L.push(`        UID: \${UID:-1000}`); L.push(`        GID: \${GID:-1000}`); }
        L.push(`    image: ros2-${distro}-${containerName}:latest`);
        L.push(`    container_name: ${containerName}`); L.push(`    hostname: ${containerName}`);
        L.push(`    stdin_open: true`); L.push(`    tty: true`);
        L.push(`    restart: unless-stopped`); L.push(`    network_mode: host`);
        L.push(`    environment:`); L.push(`      - ROS_DISTRO=${distro}`);
        if (hasX11) { L.push(`      - DISPLAY=\${DISPLAY:-:0}`); L.push(`      - QT_X11_NO_MITSHM=1`); }
        if (packages.has('cyclone_dds')) L.push(`      - RMW_IMPLEMENTATION=rmw_cyclonedds_cpp`);
        if (packages.has('turtlebot3')) L.push(`      - TURTLEBOT3_MODEL=waffle_pi`);
        L.push(`    volumes:`); L.push(`      - ./ros2_ws:${workspace}:rw`);
        if (hasX11) L.push(`      - /tmp/.X11-unix:/tmp/.X11-unix:rw`);
        if (hasCuda) {
            L.push(`    deploy:`); L.push(`      resources:`); L.push(`        reservations:`);
            L.push(`          devices:`); L.push(`            - driver: nvidia`);
            L.push(`              count: all`); L.push(`              capabilities: [gpu, compute, utility]`);
        }
        if (hasSSH) { L.push(`    ports:`); L.push(`      - "2222:22"`); }
        return L.join('\n');
    },

    buildReadme(cfg) {
        const { distro, variant, packages, tools, username, workspace, containerName, userType } = cfg;
        const u = userType === 'root' ? 'root' : username;
        return `# ROS2 ${distro[0].toUpperCase() + distro.slice(1)} Docker Environment

Generated by **ros2-docker-gen v${VERSION}**

## What's Inside
| | |
|---|---|
| **ROS2 Distro** | ${distro} (${variant}) |
| **Packages** | ${[...packages].join(', ') || 'none'} |
| **Dev Tools** | ${[...tools].join(', ')} |
| **User** | ${u} |
| **Workspace** | ${workspace} |

## Prerequisites
- Docker Engine ≥ 24  /  Docker Desktop
- docker compose v2

## Quick Start
\`\`\`bash
# Build the image (first time or after Dockerfile changes)
docker compose build

# Start the container in the background
docker compose up -d

# Open an interactive shell
docker exec -it ${containerName} bash

# Inside the container — build your workspace
cd ${workspace}
colcon build --symlink-install
source install/setup.bash

# Stop the container
docker compose down
\`\`\`

---
*Generated by ros2-docker-gen v${VERSION}*
`;
    }
};

// ─── Summary ──────────────────────────────────────────────────────────────────

function printSummary(cfg, absOut) {
    const { distro, variant, packages, tools, containerName, workspace, userType, username } = cfg;
    const hasCuda = packages.has('cuda') || packages.has('tensorrt');
    console.log(`\n${C.cyan('─'.repeat(56))}`);
    console.log(C.bold('  📋  Configuration summary'));
    console.log(C.cyan('─'.repeat(56)));
    console.log(`  ${C.dim('Distro   ')}  ${C.green(distro)} / ${C.green(variant)}`);
    console.log(`  ${C.dim('User     ')}  ${userType === 'root' ? C.yellow('root') : C.green(username)}`);
    console.log(`  ${C.dim('Workspace')}  ${workspace}`);
    console.log(`  ${C.dim('Container')}  ${containerName}`);
    if (hasCuda) console.log(`  ${C.dim('GPU      ')}  ${C.magenta('CUDA / NVIDIA enabled')}`);
    if (packages.size) console.log(`  ${C.dim('Packages ')}  ${[...packages].join(', ')}`);
    if (tools.size) console.log(`  ${C.dim('Tools    ')}  ${[...tools].join(', ')}`);
    console.log(C.cyan('─'.repeat(56)));
    console.log('');
    console.log(`  ${C.bold('Files written to')}  ${C.underline(absOut)}`);
    console.log(`     ${C.green('✔')}  Dockerfile`);
    console.log(`     ${C.green('✔')}  docker-compose.yml`);
    console.log(`     ${C.green('✔')}  README.md`);
    console.log('');
    console.log(C.bold('  🚀  Next steps'));
    console.log(`     ${C.cyan(`cd ${absOut}`)}`);
    console.log(`     ${C.cyan('docker compose build')}`);
    console.log(`     ${C.cyan('docker compose up -d')}`);
    console.log(`     ${C.cyan(`docker exec -it ${containerName} bash`)}`);
    console.log('');
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

async function main() {
    // Banner
    console.log('');
    console.log(C.cyan('╔══════════════════════════════════════════════════════╗'));
    console.log(C.cyan('║') + C.bold('        🤖  ROS2 Docker Generator  CLI  v' + VERSION + '        ') + C.cyan('║'));
    console.log(C.cyan('║') + C.dim('   Generate Dockerfiles & Compose files for ROS2      ') + C.cyan('║'));
    console.log(C.cyan('╚══════════════════════════════════════════════════════╝'));
    console.log('');
    console.log(C.dim('  This wizard will ask you 8 questions and generate:'));
    console.log(C.dim('    • Dockerfile           — ready to build'));
    console.log(C.dim('    • docker-compose.yml   — ready to run'));
    console.log(C.dim('    • README.md            — quick-start guide'));
    console.log('');
    console.log(C.dim('  Type  q  at any prompt to cancel without writing files.'));
    console.log(C.dim('  Run   ros2-docker-gen --help  for full usage guide.'));

    // ── Step 1 — Distro ──────────────────────────────────────────────────────
    step('ROS2 Distribution');
    const distro = await selectOne(
        'Which ROS2 distro do you want to use?',
        'This determines the base Docker image and available package versions.',
        DISTROS
    );

    // ── Step 2 — Variant ─────────────────────────────────────────────────────
    step('Base Image Variant');
    const variant = await selectOne(
        'Which image variant?',
        'Larger variants include more tools but produce bigger images.',
        VARIANTS
    );

    // ── Step 3 — ROS2 Packages ────────────────────────────────────────────────
    step('ROS2 Packages');
    const selPkgs = await selectMany(
        'Which ROS2 packages should be installed?',
        'These are installed via apt inside the image. Select none to skip.',
        PACKAGES
    );

    // ── Step 4 — Dev Tools ────────────────────────────────────────────────────
    step('Developer Tools');
    const selTools = await selectMany(
        'Which developer tools should be included?',
        'Pre-checked items are recommended for most ROS2 workflows.',
        TOOLS
    );

    // ── Step 5 — User Setup ───────────────────────────────────────────────────
    step('Container User');
    const userType = await selectOne(
        'Run the container as:',
        'Non-root is safer and matches your host UID to avoid file permission issues.',
        [
            { name: 'Non-root user  (recommended — avoids file permission issues)', value: 'user' },
            { name: 'Root           (simpler, but not recommended for development)', value: 'root' },
        ]
    );

    let username = 'ros', uid = 1000;
    if (userType === 'user') {
        username = await input(
            'Username inside the container',
            'Used to create the Linux user account in the image.',
            'ros',
            v => /^[a-z_][a-z0-9_-]{0,30}$/.test(v) || 'Use lowercase letters, digits, _ or - (max 31 chars)'
        );
        const rawUid = await input(
            'UID for the user',
            'Should match your host UID to avoid volume permission issues (run `id -u` to check).',
            '1000',
            v => /^\d+$/.test(v) || 'Must be a positive integer'
        );
        uid = parseInt(rawUid, 10) || 1000;
    }

    // ── Step 6 — Workspace ────────────────────────────────────────────────────
    step('Workspace Path');
    const workspace = await input(
        'Workspace path inside the container',
        'Absolute path where your ROS2 workspace will live (mounted from host).',
        '/ros2_ws',
        v => v.startsWith('/') || 'Must be an absolute path starting with /'
    );

    // ── Step 7 — Container Name ───────────────────────────────────────────────
    step('Container Name');
    const containerName = await input(
        'Container / service name',
        'Used as the docker-compose service name and the container hostname.',
        `ros2-${distro}`,
        v => /^[a-z0-9][a-z0-9_-]*$/.test(v) || 'Use lowercase letters, digits, _ or - (must start with a letter/digit)'
    );

    // ── Step 8 — Output Directory ─────────────────────────────────────────────
    step('Output Directory');
    const outputDir = await input(
        'Where should the files be written?',
        'Directory will be created if it does not exist. Relative paths are resolved from the current directory.',
        `./${containerName}`,
        null
    );

    // ── Generate ──────────────────────────────────────────────────────────────
    const cfg = {
        distro, variant,
        packages: new Set(selPkgs),
        tools: new Set(selTools),
        userType, username, uid,
        workspace, containerName,
    };

    const absOut = path.resolve(outputDir);
    try {
        fs.mkdirSync(absOut, { recursive: true });
        fs.writeFileSync(path.join(absOut, 'Dockerfile'), CORE.buildDockerfile(cfg), 'utf8');
        fs.writeFileSync(path.join(absOut, 'docker-compose.yml'), CORE.buildCompose(cfg), 'utf8');
        fs.writeFileSync(path.join(absOut, 'README.md'), CORE.buildReadme(cfg), 'utf8');
    } catch (err) {
        console.error(C.red(`\n  ✗  Could not write files: ${err.message}`));
        process.exit(1);
    }

    printSummary(cfg, absOut);

    // Optional: print Dockerfile inline
    const show = await confirm('  Print Dockerfile to terminal now?', false);
    if (show) {
        console.log('');
        console.log(C.cyan('─'.repeat(56)));
        console.log(C.bold('  Dockerfile'));
        console.log(C.cyan('─'.repeat(56)));
        console.log(fs.readFileSync(path.join(absOut, 'Dockerfile'), 'utf8'));
    }

    _rl.close();
}

main().catch(err => {
    if (err instanceof QuitSignal || err.code === 'ERR_USE_AFTER_CLOSE') {
        quit();
    }
    console.error(C.red('\n  ✗  Unexpected error: ' + (err.message || err)));
    process.exit(1);
});