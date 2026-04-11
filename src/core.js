/**
 * ROS2 Docker Generator — Core renderer (JavaScript)
 * Shared between the web UI (browser) and any Node.js tooling.
 *
 * All data and decision rules live in data/config.json.
 * This file only resolves those rules and renders output strings.
 */

let CFG = null;

// ── Internal Helpers ───────────────────────────────────────────────────

function requireConfig() {
    if (!CFG) throw new Error('Call init(config) before using the generator.');
}

function sub(str, vars) {
    return str.replace(/\{(\w+)\}/g, (_, key) => {
        if (!(key in vars)) throw new Error(`Unknown template variable: {${key}}`);
        return vars[key];
    });
}

function subAll(arr, vars) { return arr.map(s => sub(s, vars)); }
function resolveEnvMap(envMap, vars) {
    return Object.fromEntries(
        Object.entries(envMap).map(([key, value]) => [key, typeof value === 'string' ? sub(value, vars) : value])
    );
}
function shellQuote(value) { return `'${value.replace(/'/g, `'\"'\"'`)}'`; }
function homeFor(username, isRoot) { return isRoot ? '/root' : `/home/${username}`; }
function visiblePackageNames(packages) {
    return [...packages]
        .map(key => CFG.ros_packages[key] || {})
        .map(pkg => pkg.label || key);
}

export function defaultUsername() { requireConfig(); return CFG.defaults.username; }
export function defaultUid() { requireConfig(); return CFG.defaults.uid; }
export function defaultUserType() { requireConfig(); return CFG.defaults.user_type; }
export function defaultWorkspace(username, userType) {
    requireConfig();
    const template = userType === 'root' ? CFG.defaults.root_workspace : CFG.defaults.user_workspace;
    return sub(template, { username });
}
export function defaultContainerName(distro) {
    requireConfig();
    return sub(CFG.defaults.container_name, { distro });
}

// ── Exported Methods ───────────────────────────────────────────────────

/** Initialize with the parsed config object */
export function init(parsedConfig) { CFG = parsedConfig; }

/** 
 * Resolve the base image tag 
 * @returns {string} e.g. "ros:jazzy-ros-base" or "nvidia/cuda:..."
 */
export function getBaseImage(distro, variant, hasCuda) {
    requireConfig();
    const d = CFG.distros[distro];
    if (!d) throw new Error(`Unknown distro: ${distro}`);
    if (hasCuda) {
        return sub(CFG.cuda_base_image, {
            cuda_version: d.cuda_version,
            ubuntu_image_suffix: d.ubuntu_image_suffix,
        });
    }
    const v = CFG.variants[variant];
    if (!v) throw new Error(`Unknown variant: ${variant}`);
    return sub(v.base_image, { distro });
}

/** Resolve ROS package key to apt package names */
export function resolveRosPackageApt(pkgKey, distro) {
    requireConfig();
    const pkg = CFG.ros_packages[pkgKey];
    if (!pkg) return [];
    if (pkg.apt_by_distros) {
        if (!(distro in pkg.apt_by_distros)) {
            throw new Error(`Package ${pkgKey} is not supported on distro ${distro}`);
        }
        return subAll(pkg.apt_by_distros[distro], { distro });
    }
    if (pkg.switches_base_image) return [];
    if (pkg.skip_on_distros && pkg.skip_on_distros.includes(distro)) return [];
    const vars = { distro };
    const names = subAll(pkg.apt, vars);
    if (pkg.extra_apt_on_distros && pkg.extra_apt_on_distros.distros.includes(distro)) {
        names.push(...subAll(pkg.extra_apt_on_distros.apt, vars));
    }
    return names;
}

/**
 * Resolve relationship rules, automatic selections, and OS-specific scaffolding.
 */
export function resolveConfig(config) {
    requireConfig();
    const res = { ...config };
    const distro = res.distro;
    const variant = res.variant;
    const packages = new Set(res.packages || []);
    const tools = new Set(res.tools || []);

    // 1. Variant Implications
    const vCfg = CFG.variants[variant] || {};
    if (vCfg.implies_packages) {
        for (let pKey of vCfg.implies_packages) {
            if (pKey === 'gazebo_distro_specific') {
                const dCfg = CFG.distros[distro] || {};
                pKey = dCfg.gazebo_pkg || 'gz_sim';
            }
            packages.add(pKey);
        }
    }

    // 2. GUI Dependencies
    let hasGuiPkg = false;
    for (const pKey of packages) {
        const pCfg = CFG.ros_packages[pKey] || {};
        if (pCfg.is_gui) { hasGuiPkg = true; break; }
    }
    if (hasGuiPkg) tools.add('x11');

    res.packages = Array.from(packages);
    res.tools = Array.from(tools);
    return res;
}

/** Build Dockerfile content */
export function buildDockerfile(config) {
    requireConfig();
    const { distro, variant, packages, tools, username, uid, workspace, userType } = config;
    const isRoot = userType === 'root';
    const pkgsSet = new Set(packages);
    const toolsSet = new Set(tools);
    const hasCuda = pkgsSet.has('cuda') || pkgsSet.has('tensorrt');
    const d = CFG.distros[distro];
    const vars = { distro, cuda_version: d.cuda_version, ubuntu_image_suffix: d.ubuntu_image_suffix };

    const L = [];
    const ln = s => L.push(s);
    const gap = () => L.push('');

    ln(`# =============================================================`);
    ln(`# ROS2 ${d.label} Dockerfile`);
    ln(`# Generated by ros2-dockergen v${CFG.version}`);
    ln(`# =============================================================`);
    gap();
    ln(`FROM ${getBaseImage(distro, variant, hasCuda)}`);
    gap();

    if (hasCuda) {
        ln(`# ── Install ROS2 on top of CUDA base ───────────────────────`);
        ln(`ENV DEBIAN_FRONTEND=noninteractive`);
        ln(`RUN apt-get update && apt-get install -y \\`);
        CFG.cuda_ros_install_apt.forEach(p => ln(`    ${p} \\`));
        ln(`    && curl -sSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.key \\`);
        ln(`    -o /usr/share/keyrings/ros-archive-keyring.gpg && \\`);
        ln(`    echo "deb [arch=\$(dpkg --print-architecture) signed-by=/usr/share/keyrings/ros-archive-keyring.gpg] \\`);
        ln(`    http://packages.ros.org/ros2/ubuntu \$(lsb_release -cs) main" \\`);
        ln(`    > /etc/apt/sources.list.d/ros2.list && \\`);
        ln(`    apt-get update && apt-get install -y ros-${distro}-${variant} && \\`);
        ln(`    rm -rf /var/lib/apt/lists/*`);
        gap();
    }

    ln(`ENV DEBIAN_FRONTEND=noninteractive`);
    ln(`SHELL ["/bin/bash", "-c"]`);
    gap();

    if (!hasCuda && variant === 'desktop-full') {
        const extra = subAll(CFG.variants['desktop-full'].extra_apt, { distro });
        ln(`# ── Upgrade to desktop-full ─────────────────────────────────`);
        ln(`RUN apt-get update && apt-get install -y \\`);
        extra.forEach(p => ln(`    ${p} \\`));
        ln(`    && rm -rf /var/lib/apt/lists/*`);
        gap();
    }

    if (toolsSet.has('locale')) {
        const locale = CFG.tools.locale;
        ln(`# ── Locale ───────────────────────────────────────────────────`);
        ln(`RUN apt-get update && apt-get install -y ${locale.apt.join(' ')} && \\`);
        ln(`    ${locale.post_install_run} && \\`);
        ln(`    rm -rf /var/lib/apt/lists/*`);
        Object.entries(locale.env).forEach(([k, v]) => ln(`ENV ${k}=${v}`));
        gap();
    }

    const sysApt = [...CFG.system_apt_always];
    for (const toolKey of toolsSet) {
        if (['locale', 'zsh', 'ssh'].includes(toolKey)) continue;
        const tool = CFG.tools[toolKey];
        if (tool && tool.apt.length > 0 && !tool.ros_build_tool) sysApt.push(...tool.apt);
    }
    if (!isRoot) sysApt.push('sudo');
    ln(`# ── System packages ──────────────────────────────────────────`);
    ln(`RUN apt-get update && apt-get install -y \\`);
    sysApt.forEach(p => ln(`    ${p} \\`));
    ln(`    && rm -rf /var/lib/apt/lists/*`);
    gap();

    const buildApt = [...CFG.ros_build_tools_always];
    for (const toolKey of toolsSet) {
        const tool = CFG.tools[toolKey];
        if (tool && tool.ros_build_tool) buildApt.push(...tool.apt);
    }
    ln(`# ── ROS2 build tools ─────────────────────────────────────────`);
    ln(`RUN apt-get update && apt-get install -y \\`);
    buildApt.forEach(p => ln(`    ${p} \\`));
    ln(`    && rm -rf /var/lib/apt/lists/*`);
    if (toolsSet.has('rosdep')) { gap(); ln(`RUN ${sub(CFG.tools.rosdep.post_install_run, vars)}`); }
    gap();

    if (toolsSet.has('zsh')) {
        ln(`# ── Zsh + Oh-My-Zsh ──────────────────────────────────────────`);
        ln(`RUN apt-get update && apt-get install -y zsh && rm -rf /var/lib/apt/lists/*`);
        gap();
    }

    const rosApt = [];
    for (const pkgKey of pkgsSet) rosApt.push(...resolveRosPackageApt(pkgKey, distro));
    if (rosApt.length > 0) {
        ln(`# ── ROS2 packages ────────────────────────────────────────────`);
        ln(`RUN apt-get update && apt-get install -y \\`);
        rosApt.forEach(p => ln(`    ${p} \\`));
        ln(`    && rm -rf /var/lib/apt/lists/*`);
        gap();
    }

    for (const pkgKey of pkgsSet) {
        const pkg = CFG.ros_packages[pkgKey];
        if (pkg && pkg.env) {
            Object.entries(resolveEnvMap(pkg.env, vars)).forEach(([k, v]) => ln(`ENV ${k}=${v}`));
            gap();
        }
    }

    if (toolsSet.has('ssh')) {
        const ssh = CFG.tools.ssh;
        ln(`# ── SSH server ────────────────────────────────────────────────`);
        ln(`RUN apt-get update && apt-get install -y ${ssh.apt.join(' ')} && \\`);
        ln(`    ${ssh.post_install_run} && \\`);
        ln(`    rm -rf /var/lib/apt/lists/*`);
        ln(`EXPOSE ${ssh.expose_port}`);
        gap();
    }

    const home = homeFor(username, isRoot);

    if (!isRoot) {
        ln(`# ── Non-root user ────────────────────────────────────────────`);
        ln(`ARG UID=${uid}`);
        ln(`ARG GID=${uid}`);
        ln(`RUN if getent group \${GID} >/dev/null; then \\`);
        ln(`        groupmod -n ${username} \$(getent group \${GID} | cut -d: -f1); \\`);
        ln(`    else groupadd -g \${GID} ${username}; fi && \\`);
        ln(`    if getent passwd \${UID} >/dev/null; then \\`);
        ln(`        usermod -l ${username} -m -d /home/${username} \$(getent passwd \${UID} | cut -d: -f1); \\`);
        ln(`    else useradd -m -u \${UID} -g \${GID} -s /bin/bash ${username}; fi`);
        if (toolsSet.has('sudo')) ln(`RUN echo "${username} ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers`);
        gap();
        ln(`RUN mkdir -p ${workspace}/src && chown -R ${username}:${username} ${workspace}`);
        gap();
        ln(`USER ${username}`);
    } else {
        ln(`RUN mkdir -p ${workspace}/src`);
    }
    ln(`WORKDIR ${workspace}`);
    gap();

    if (toolsSet.has('zsh')) {
        ln(`RUN ${sub(CFG.tools.zsh.post_install_run, { home })}`);
        gap();
    }

    if (toolsSet.has('bashrc') || toolsSet.has('zsh')) {
        ln(`# ── Shell setup ───────────────────────────────────────────────`);
        if (toolsSet.has('bashrc')) {
            ln(`RUN echo "source /opt/ros/${distro}/setup.bash" >> ${home}/.bashrc`);
            for (const pkgKey of pkgsSet) {
                const pkg = CFG.ros_packages[pkgKey];
                if (pkg && pkg.env) {
                    Object.entries(resolveEnvMap(pkg.env, vars)).forEach(([k, v]) =>
                        ln(`RUN echo ${shellQuote(`export ${k}=${v}`)} >> ${home}/.bashrc`)
                    );
                }
            }
        }
        if (toolsSet.has('zsh')) {
            ln(`RUN echo "source /opt/ros/${distro}/setup.bash" >> ${home}/.zshrc`);
            for (const pkgKey of pkgsSet) {
                const pkg = CFG.ros_packages[pkgKey];
                if (pkg && pkg.env) {
                    Object.entries(resolveEnvMap(pkg.env, vars)).forEach(([k, v]) =>
                        ln(`RUN echo ${shellQuote(`export ${k}=${v}`)} >> ${home}/.zshrc`)
                    );
                }
            }
        }
        gap();
    }

    for (const toolKey of toolsSet) {
        const tool = CFG.tools[toolKey];
        if (tool && tool.env) {
            Object.entries(resolveEnvMap(tool.env, vars)).forEach(([k, v]) => ln(`ENV ${k}=${v}`));
            gap();
        }
    }

    if (hasCuda) {
        ln(`# ── NVIDIA GPU runtime ──────────────────────────────────────`);
        ln(`ENV NVIDIA_VISIBLE_DEVICES=all`);
        ln(`ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility,graphics`);
        gap();
    }

    ln(`CMD ["/bin/bash"]`);
    return L.join('\n');
}

/** Build docker-compose.yml content */
export function buildCompose(config) {
    requireConfig();
    const { distro, packages, tools, workspace, containerName, userType, hostOs } = config;
    const currentHostOs = hostOs || config.host_os || 'linux';
    const isRoot = userType === 'root';
    const pkgsSet = new Set(packages);
    const toolsSet = new Set(tools);
    const hasCuda = pkgsSet.has('cuda') || pkgsSet.has('tensorrt');

    const L = [];
    const ln = s => L.push(s);

    ln(`# docker-compose.yml — generated by ros2-dockergen v${CFG.version}`);
    ln(`services:`);
    ln(`  ${containerName}:`);
    ln(`    build:`);
    ln(`      context: .`);
    ln(`      dockerfile: Dockerfile`);
    if (!isRoot) { ln(`      args:`); ln(`        UID: \${UID:-1000}`); ln(`        GID: \${GID:-1000}`); }
    ln(`    image: ros2-${distro}-${containerName}:latest`);
    ln(`    container_name: ${containerName}`);
    ln(`    hostname: ${containerName}`);
    ln(`    stdin_open: true`);
    ln(`    tty: true`);
    ln(`    restart: unless-stopped`);
    ln(`    network_mode: host`);
    ln(`    environment:`);
    ln(`      - ROS_DISTRO=${distro}`);

    // ── Environment ─────────────────────────────────────────────
    for (const toolKey of toolsSet) {
        const tool = CFG.tools[toolKey];
        if (tool && tool.compose_env) {
            Object.entries(resolveEnvMap(tool.compose_env, { distro })).forEach(([k, v]) => ln(`      - ${k}=${v}`));
        }
    }
    if (toolsSet.has('x11')) {
        const osCfg = CFG.host_os[currentHostOs] || CFG.host_os.linux;
        if (osCfg.x11_env) {
            Object.entries(osCfg.x11_env).forEach(([k, v]) => ln(`      - ${k}=${v}`));
        }
    }

    if (hasCuda) {
        ln(`      - __GLX_VENDOR_LIBRARY_NAME=nvidia`);
    }

    for (const pkgKey of pkgsSet) {
        const pkg = CFG.ros_packages[pkgKey];
        if (pkg && pkg.env) {
            Object.entries(resolveEnvMap(pkg.env, { distro })).forEach(([k, v]) => ln(`      - ${k}=${v}`));
        }
    }

    // ── Volumes ─────────────────────────────────────────────────
    ln(`    volumes:`);
    ln(`      - .:${workspace}:rw`);
    for (const toolKey of toolsSet) {
        const tool = CFG.tools[toolKey];
        if (tool && tool.compose_volumes) tool.compose_volumes.forEach(v => ln(`      - ${v}`));
    }
    if (toolsSet.has('x11')) {
        const osCfg = CFG.host_os[currentHostOs] || CFG.host_os.linux;
        if (osCfg.x11_volumes) {
            osCfg.x11_volumes.forEach(v => ln(`      - ${v}`));
        }
    }

    if (hasCuda) {
        ln(`    runtime: nvidia`);
    }
    return L.join('\n');
}

/** Build README.md content */
export function buildReadme(config) {
    requireConfig();
    const { distro, variant, packages, tools, username, workspace, containerName, userType } = config;
    const pkgsSet = new Set(packages);
    const u = userType === 'root' ? 'root' : username;
    const d = CFG.distros[distro];
    const pkgsStr = visiblePackageNames(pkgsSet).join(', ') || 'none';
    const toolsStr = [...tools].map(t => (CFG.tools[t] || t).label || t).join(', ');
    const gpuNote = (pkgsSet.has('cuda') || pkgsSet.has('tensorrt')) ? `
## GPU Requirements
- CUDA / TensorRT selections assume you intend to run on an NVIDIA-capable host
- The host must already have working NVIDIA drivers and NVIDIA Container Toolkit/runtime configured
- **Hybrid GPUs (Laptop):** On some laptops, OpenGL may fall back to CPU rendering. If RViz or Gazebo are slow, ensure the host is using NVIDIA as the primary GPU (e.g., \`sudo prime-select nvidia\`) or configure PRIME offloading.
- If the host NVIDIA stack is not ready, \`docker compose up -d\` may fail before the container starts

` : '';

    return `# ROS2 ${d.label} Docker Environment

Generated by **ros2-dockergen v${CFG.version}**

## What's Inside
| | |
|---|---|
| **ROS2 Distro** | ${distro} (${variant}) |
| **Packages** | ${pkgsStr} |
| **Dev Tools** | ${toolsStr} |
| **User** | ${u} |
| **Workspace** | ${workspace} |

## Prerequisites
- Docker Engine ≥ 24 / Docker Desktop
- docker compose v2

${gpuNote}## Quick Start
\`\`\`bash
docker compose build
docker compose up -d
docker exec -it ${containerName} bash

cd ${workspace}
colcon build --symlink-install
source install/setup.bash

docker compose down
\`\`\`

This setup mounts the current directory into \`${workspace}\` so you can build existing repo files in place.

---
*Generated by ros2-dockergen v${CFG.version}*
`;
}

// ── Choice lists for UI ────────────────────────────────────────────────

export function getDistros() {
    requireConfig();
    return Object.entries(CFG.distros).map(([key, d]) => ({
        value: key, label: d.label, ubuntu: d.ubuntu, recommended: d.recommended, is_lts: d.is_lts,
    }));
}

export function getVariants() {
    requireConfig();
    return Object.entries(CFG.variants).map(([key, v]) => ({
        value: key, label: v.label, description: v.description,
    }));
}

export function getRosPackageChoices() {
    requireConfig();
    return Object.entries(CFG.ros_packages).map(([key, p]) => ({
        value: key, label: p.label, description: p.description,
    }));
}

export function getToolChoices() {
    requireConfig();
    return Object.entries(CFG.tools).map(([key, t]) => ({
        value: key, label: t.label, description: t.description, default: t.default,
    }));
}

export function getHostOsChoices() {
    requireConfig();
    return Object.entries(CFG.host_os).map(([key, o]) => ({
        value: key, label: o.label, description: o.description,
    }));
}

// ── Browser Compatibility Layer ────────────────────────────────────────

if (typeof window !== 'undefined') {
    window.ROS2_DOCKER_GEN_CORE = {
        init, getBaseImage, buildDockerfile, buildCompose, buildReadme,
        getDistros, getVariants, getRosPackageChoices, getToolChoices, getHostOsChoices,
        defaultUsername, defaultUid, defaultUserType, defaultWorkspace, defaultContainerName,
        resolveConfig
    };
}
