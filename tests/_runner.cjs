const path = require('path');
const R = path.join(__dirname, '..');
const CORE = require(path.join(R, 'src', 'core.cjs'));
CORE.initFromFile(path.join(R, 'data', 'config.json'));
const raw = JSON.parse(process.argv[2]);
const cfg = {
    ...raw,
    packages:      new Set(raw.packages),
    tools:         new Set(raw.tools),
    containerName: raw.container_name,
    userType:      raw.user_type,
};
process.stdout.write(JSON.stringify({
    dockerfile: CORE.buildDockerfile(cfg),
    compose:    CORE.buildCompose(cfg),
    readme:     CORE.buildReadme(cfg),
}));
