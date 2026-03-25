#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as CORE from '../src/core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const uid = parseInt(getArg('uid', '1000'), 10);
const outDir = getArg('out', './ci-output');
const cname = getArg('container', 'ros2_dev');
const userType = getArg('usertype', 'user'); // Changed from 'custom' to match core.js expected values: 'user' | 'root'

// ── Load Config & Init Core ───────────────────────────────────
const _ROOT = path.join(__dirname, '..');
const configPath = path.join(_ROOT, 'src', 'ros2_dockergen', 'data', 'config.json');
const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
CORE.init(configData);

const config = {
  distro,
  variant,
  packages: pkgArg ? pkgArg.split(',').map(s => s.trim()) : [],
  tools: toolArg.split(',').map(s => s.trim()),
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
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const dockerfilePath = path.join(outDir, 'Dockerfile');
const composePath = path.join(outDir, 'docker-compose.yml');
const readmePath = path.join(outDir, 'README.md');

fs.writeFileSync(dockerfilePath, CORE.buildDockerfile(config));
fs.writeFileSync(composePath, CORE.buildCompose(config));
fs.writeFileSync(readmePath, CORE.buildReadme(config));

console.log(`✓ Dockerfile    → ${dockerfilePath}`);
console.log(`✓ compose       → ${composePath}`);
console.log(`✓ README        → ${readmePath}`);
console.log(`  distro=${distro}  variant=${variant}  user=${config.userType === 'root' ? 'root' : username}`);
