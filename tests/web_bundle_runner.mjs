import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as CORE from '../src/core.js';
import { createZipBytes } from '../src/web_bundle.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'src', 'ros2_dockergen', 'data', 'config.json'), 'utf8'));
CORE.init(config);

const distro = 'humble';
const username = config.defaults.username;
const userType = config.defaults.user_type;
const workspace = config.defaults.user_workspace.replace('{username}', username);
const containerName = CORE.defaultContainerName(distro);

const generatorConfig = {
    distro,
    variant: 'desktop-full',
    packages: ['nav2', 'cv_bridge', 'cuda', 'tensorrt'],
    tools: CORE.getToolChoices().filter(tool => tool.default).map(tool => tool.value),
    username,
    uid: config.defaults.uid,
    workspace,
    userType,
    containerName,
};

const files = [
    { name: 'Dockerfile', content: CORE.buildDockerfile(generatorConfig) },
    { name: 'docker-compose.yml', content: CORE.buildCompose(generatorConfig) },
    { name: 'README.md', content: CORE.buildReadme(generatorConfig) },
];

const zipPath = process.argv[2];
fs.writeFileSync(zipPath, createZipBytes(files));
fs.writeFileSync(`${zipPath}.json`, JSON.stringify({
    containerName,
    files: Object.fromEntries(files.map(file => [file.name, file.content])),
}, null, 2));
