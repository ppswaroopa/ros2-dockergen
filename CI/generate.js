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
const hostOs = getArg('host-os', 'linux');
const targetPlatformArg = getArg('target', getArg('target-platform', ''));
const pkgArg = getArg('packages', '');
const outDir = getArg('out', './ci-output');
const cname = getArg('container', '');

// ── Load Config & Init Core ───────────────────────────────────
const _ROOT = path.join(__dirname, '..');
const configPath = path.join(_ROOT, 'src', 'ros2_dockergen', 'data', 'config.json');
const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
CORE.init(configData);
const defaults = configData.defaults;
const targetPlatform = targetPlatformArg || configData.host_os?.[hostOs]?.target_platform || defaults.target_platform || 'amd64';
const defaultTools = Object.entries(configData.tools)
  .filter(([, tool]) => tool.default)
  .map(([key]) => key)
  .join(',');
const toolArg = getArg('tools', defaultTools);
const rawUserType = getArg('usertype', defaults.user_type);
const userType = rawUserType === 'custom' ? 'user' : rawUserType;
const username = getArg('username', defaults.username);
const uid = parseInt(getArg('uid', String(defaults.uid)), 10);

const config = {
  targetPlatform,
  distro,
  variant,
  hostOs,
  packages: pkgArg ? pkgArg.split(',').map(s => s.trim()) : [],
  tools: toolArg.split(',').map(s => s.trim()),
  username,
  uid,
  userType,
  containerName: cname || CORE.defaultContainerName(distro),
  workspace: getArg(
    'workspace',
    userType === 'root'
      ? defaults.root_workspace
      : defaults.user_workspace.replace('{username}', username)
  )
};

// ── Validate inputs ───────────────────────────────────────────
const validDistros = ['humble', 'jazzy', 'kilted'];
const validVariants = ['ros-base', 'desktop', 'desktop-full'];
const validTargets = Object.keys(configData.target_platforms || { amd64: {} });
const validHostOs = Object.keys(configData.host_os || { linux: {} });

if (!validHostOs.includes(hostOs)) {
  console.error(`ERROR: --host-os must be one of: ${validHostOs.join(', ')}`);
  process.exit(1);
}
if (!validTargets.includes(targetPlatform)) {
  console.error(`ERROR: --target must be one of: ${validTargets.join(', ')}`);
  process.exit(1);
}
if (!validDistros.includes(distro)) {
  console.error(`ERROR: --distro must be one of: ${validDistros.join(', ')}`);
  process.exit(1);
}
if (!validVariants.includes(variant)) {
  console.error(`ERROR: --variant must be one of: ${validVariants.join(', ')}`);
  process.exit(1);
}

// ── Generate ──────────────────────────────────────────────────
const resolved = CORE.resolveConfig(config);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const dockerfilePath = path.join(outDir, 'Dockerfile');
const composePath = path.join(outDir, 'docker-compose.yml');
const readmePath = path.join(outDir, 'README.md');

fs.writeFileSync(dockerfilePath, CORE.buildDockerfile(resolved));
fs.writeFileSync(composePath, CORE.buildCompose(resolved));
fs.writeFileSync(readmePath, CORE.buildReadme(resolved));

console.log(`✓ Dockerfile    → ${dockerfilePath}`);
console.log(`✓ compose       → ${composePath}`);
console.log(`✓ README        → ${readmePath}`);
console.log(`  host=${hostOs}  target=${targetPlatform}  distro=${distro}  variant=${variant}  user=${config.userType === 'root' ? 'root' : username}`);
