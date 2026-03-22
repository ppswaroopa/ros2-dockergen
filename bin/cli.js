#!/usr/bin/env node

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Native ESM imports
import * as CORE from '../src/core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VERSION = '1.0.0';
const _ROOT = path.join(__dirname, '..');

// Initialize with shared config
const configPath = path.join(_ROOT, 'src', 'ros2_dockergen', 'data', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
CORE.init(config);

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
${C.bold('ros2-dockergen')} v${VERSION}
Generate a Dockerfile, docker-compose.yml and README for a ROS2 project.

${C.bold('USAGE')}
  ros2-dockergen            Run the interactive wizard
  ros2-dockergen --help     Show this help message
  ros2-dockergen --version  Print the version number

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
  ros2-dockergen

  # Install from a cloned repo and run
  ./install.sh
  ros2-dockergen
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

const _rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdout.isTTY,
});
const _lineQueue = [];
const _waiters = [];
let _rlClosed = false;

_rl.on('line', line => {
    if (_waiters.length) _waiters.shift()(line);
    else _lineQueue.push(line);
});
_rl.on('close', () => {
    _rlClosed = true;
    while (_waiters.length) _waiters.shift()(null);
});

function _readLine() {
    return new Promise(resolve => {
        if (_lineQueue.length) return resolve(_lineQueue.shift());
        if (_rlClosed) return resolve(null);
        _waiters.push(resolve);
    });
}

async function ask(prompt, defaultVal = '') {
    const hint = defaultVal ? C.dim(` [${defaultVal}]`) : '';
    const qhint = C.gray('  (q to quit)');
    process.stdout.write(`${prompt}${hint}${qhint} › `);
    const line = await _readLine();
    if (line === null) throw new QuitSignal();
    const answer = line.trim();
    if (answer.toLowerCase() === 'q') throw new QuitSignal();
    return answer || defaultVal;
}

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

async function confirm(question, def = false) {
    const hint = def ? 'Y/n' : 'y/N';
    let raw;
    try { raw = await ask(`${C.bold(question)} ${C.dim(`[${hint}]`)}`, def ? 'y' : 'n'); }
    catch (e) { if (e instanceof QuitSignal) quit(); throw e; }
    return raw.toLowerCase().startsWith('y');
}

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

// ─── Choice definitions from CORE ─────────────────────────────────────────────

function getDistroChoices() {
    return CORE.getDistros().map(d => {
        const rec = d.recommended ? '  (recommended)' : '';
        return { name: `${d.label.padEnd(8)} — Ubuntu ${d.ubuntu} LTS${rec}`, value: d.value };
    });
}

function getVariantChoices() {
    return CORE.getVariants().map(v => ({
        name: `${v.label.padEnd(13)} ${v.description}`,
        value: v.value
    }));
}

function getPackageChoices() {
    return CORE.getRosPackageChoices().map(p => ({
        name: `${p.label.padEnd(16)} ${p.description}`,
        value: p.value
    }));
}

function getToolChoices() {
    return CORE.getToolChoices().map(t => ({
        name: `${t.label.padEnd(11)} ${t.description}`,
        value: t.value,
        checked: t.default
    }));
}

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

// ─── Summary ──────────────────────────────────────────────────────────────────

function printSummary(cfg, absOut) {
    const { distro, variant, packages, tools, containerName, workspace, userType, username } = cfg;
    const pkgsSet = new Set(packages);
    const hasCuda = pkgsSet.has('cuda') || pkgsSet.has('tensorrt');

    console.log(`\n${C.cyan('─'.repeat(56))}`);
    console.log(C.bold('  📋  Configuration summary'));
    console.log(C.cyan('─'.repeat(56)));
    console.log(`  ${C.dim('Distro   ')}  ${C.green(distro)} / ${C.green(variant)}`);
    console.log(`  ${C.dim('User     ')}  ${userType === 'root' ? C.yellow('root') : C.green(username)}`);
    console.log(`  ${C.dim('Workspace')}  ${workspace}`);
    console.log(`  ${C.dim('Container')}  ${containerName}`);
    if (hasCuda) console.log(`  ${C.dim('GPU      ')}  ${C.magenta('CUDA / NVIDIA enabled')}`);
    if (packages.length) console.log(`  ${C.dim('Packages ')}  ${packages.join(', ')}`);
    if (tools.length) console.log(`  ${C.dim('Tools    ')}  ${tools.join(', ')}`);
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
    console.log(C.dim('  Run   ros2-dockergen --help  for full usage guide.'));

    step('ROS2 Distribution');
    const distro = await selectOne(
        'Which ROS2 distro do you want to use?',
        'This determines the base Docker image and available package versions.',
        getDistroChoices()
    );

    step('Base Image Variant');
    const variant = await selectOne(
        'Which image variant?',
        'Larger variants include more tools but produce bigger images.',
        getVariantChoices()
    );

    step('ROS2 Packages');
    const packages = await selectMany(
        'Which ROS2 packages should be installed?',
        'These are installed via apt inside the image. Select none to skip.',
        getPackageChoices()
    );

    step('Developer Tools');
    const tools = await selectMany(
        'Which developer tools should be included?',
        'Pre-checked items are recommended for most ROS2 workflows.',
        getToolChoices()
    );

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

    step('Workspace Path');
    const defaultWs = userType === 'root' ? '/root/ros2_ws' : `/home/${username}/ros2_ws`;
    const workspace = await input(
        'Workspace path inside the container',
        'Absolute path where your ROS2 workspace will live (mounted from host).',
        defaultWs,
        v => v.startsWith('/') || 'Must be an absolute path starting with /'
    );

    step('Container Name');
    const containerName = await input(
        'Container / service name',
        'Used as the docker-compose service name and the container hostname.',
        `ros2-${distro}`,
        v => /^[a-z0-9][a-z0-9_-]*$/.test(v) || 'Use lowercase letters, digits, _ or - (must start with a letter/digit)'
    );

    step('Output Directory');
    const outputDir = await input(
        'Where should the files be written?',
        'Directory will be created if it does not exist. Relative paths are resolved from the current directory.',
        `./${containerName}`,
        null
    );

    const cfg = {
        distro, variant,
        packages, tools,
        userType, username, uid,
        workspace, containerName,
    };

    const absOut = path.resolve(outputDir);
    try {
        if (!fs.existsSync(absOut)) fs.mkdirSync(absOut, { recursive: true });
        fs.writeFileSync(path.join(absOut, 'Dockerfile'), CORE.buildDockerfile(cfg), 'utf8');
        fs.writeFileSync(path.join(absOut, 'docker-compose.yml'), CORE.buildCompose(cfg), 'utf8');
        fs.writeFileSync(path.join(absOut, 'README.md'), CORE.buildReadme(cfg), 'utf8');
    } catch (err) {
        console.error(C.red(`\n  ✗  Could not write files: ${err.message}`));
        process.exit(1);
    }

    printSummary(cfg, absOut);

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
    console.error(C.red('\n  ✗  Unexpected error: ' + (err.message || err.stack || err)));
    process.exit(1);
});