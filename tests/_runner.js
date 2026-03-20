import * as CORE from '../src/core.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(R, 'data', 'config.json'), 'utf8'));
CORE.init(config);
const raw = JSON.parse(process.argv[2]);
const cfg = {
    ...raw,
    packages:      raw.packages,
    tools:         raw.tools,
    containerName: raw.container_name,
    userType:      raw.user_type,
};
process.stdout.write(JSON.stringify({
    dockerfile: CORE.buildDockerfile(cfg),
    compose:    CORE.buildCompose(cfg),
    readme:     CORE.buildReadme(cfg),
}));
