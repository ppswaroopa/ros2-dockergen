#!/usr/bin/env node
// =============================================================
// ros2-docker-generator/generate.js
// Generates Dockerfile + docker-compose.yml for a given config.
// Used by CI to produce files that are then built + tested.
//
// Usage:
//   node ros2-docker-generator/generate.js --distro humble --variant ros-base --out /tmp/test-humble-base
//   node ros2-docker-generator/generate.js --distro jazzy  --variant desktop  --out /tmp/test-jazzy-desktop
//
// All flags:
//   --distro    humble | jazzy | kilted
//   --variant   ros-base | desktop | desktop-full
//   --packages  comma-separated: nav2,slam_toolbox,turtlebot3,...
//   --tools     comma-separated: colcon,rosdep,python3,git,x11,...
//   --username  default: ros-dev
//   --uid       default: 1000
//   --workspace default: /home/<username>/ros2_ws
//   --out       output directory (created if missing)
// =============================================================

const fs = require('fs');
const path = require('path');
const core = require('./core.js');

// ── Parse args ────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, fallback = '') {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : fallback;
}

const distro = getArg('distro', 'humble');
const variant = getArg('variant', 'ros-base');
const pkgArg = getArg('packages', '');
const toolArg = getArg('tools', 'colcon,rosdep,python3,git,bashrc,locale,sudo');
const username = getArg('username', 'ros-dev');
const uid = getArg('uid', '1000');
const outDir = getArg('out', './ci-output');
const cname = getArg('container', 'ros2_dev');
const userType = getArg('usertype', 'custom');

const config = {
  distro,
  variant,
  packages: new Set(pkgArg ? pkgArg.split(',').map(s => s.trim()) : []),
  tools: new Set(toolArg.split(',').map(s => s.trim())),
  username,
  uid,
  userType,
  containerName: cname,
  workspace: getArg('workspace', userType === 'root' ? '/root/ros2_ws' : `/home/${username}/ros2_ws`)
};

// ── Validate inputs ───────────────────────────────────────────
const validDistros = ['humble', 'jazzy', 'kilted'];
const validVariants = ['ros-base', 'desktop', 'desktop-full'];

if (!validDistros.includes(distro)) {
  console.error(`ERROR: --distro must be one of: ${validDistros.join(', ')}`);
  process.exit(1);
}
if (!validVariants.includes(variant)) {
  console.error(`ERROR: --variant must be one of: ${validVariants.join(', ')}`);
  process.exit(1);
}

// ── Generate ──────────────────────────────────────────────────
fs.mkdirSync(outDir, { recursive: true });

const dockerfilePath = path.join(outDir, 'Dockerfile');
const composePath = path.join(outDir, 'docker-compose.yml');
const readmePath = path.join(outDir, 'README.md');

fs.writeFileSync(dockerfilePath, core.buildDockerfile(config));
fs.writeFileSync(composePath, core.buildCompose(config));
fs.writeFileSync(readmePath, core.buildReadme(config));

console.log(`✓ Dockerfile    → ${dockerfilePath}`);
console.log(`✓ compose       → ${composePath}`);
console.log(`✓ README        → ${readmePath}`);
console.log(`  distro=${distro}  variant=${variant}  user=${config.userType === 'root' ? 'root' : username}`);
