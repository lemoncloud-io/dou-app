import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = relative => readFileSync(join(root, relative), 'utf8');
const complete = process.argv.includes('--complete');

const ADDED_OVER_ELECTRON = ['OAuthLogin', 'OpenURL'];
const BUILT_IN = ['WebAppReady', 'Ping'];

const registered = source => [...source.matchAll(/registerHandler\('(\w+)'/g)].map(match => match[1]);

const electron = new Set([
    ...BUILT_IN,
    ...registered(read('apps/desktop/src/main/bridgeHandlers.ts')),
    ...registered(read('apps/desktop/src/main/updater.ts')),
]);
const expected = new Set([...electron, ...ADDED_OVER_ELECTRON]);

const handledBlock = read('apps/desktop-tauri/src-tauri/src/handlers/mod.rs').match(
    /HANDLED: &\[&str\] = &\[([^\]]*)\]/
);
if (!handledBlock) throw new Error('HANDLED list not found in src-tauri/src/handlers/mod.rs');
const tauri = new Set([...handledBlock[1].matchAll(/"(\w+)"/g)].map(match => match[1]));

const tsResponses = new Map(
    [...read('libs/bridge-messages/src/types/web-message-response.ts').matchAll(/^\s{4}(\w+): '(\w+)',$/gm)].map(m => [
        m[1],
        m[2],
    ])
);
const rustResponses = new Map(
    [
        ...read('apps/desktop-tauri/crates/bridge-host/src/response_types.rs').matchAll(
            /\(\s*"(\w+)",\s*"(\w+)",?\s*\)/g
        ),
    ].map(m => [m[1], m[2]])
);

const problems = [];
for (const name of tauri)
    if (!expected.has(name))
        problems.push(`Tauri handles ${name}, which Electron does not and which is not a documented addition`);
if (complete) for (const name of expected) if (!tauri.has(name)) problems.push(`Tauri does not handle ${name}`);
for (const [request, response] of tsResponses) {
    if (rustResponses.get(request) !== response)
        problems.push(`response type of ${request}: TS ${response}, Rust ${rustResponses.get(request) ?? 'missing'}`);
}
for (const request of rustResponses.keys())
    if (!tsResponses.has(request)) problems.push(`Rust response table has ${request}, which TS does not`);

if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
}
console.log(
    `bridge contract ok: Electron ${electron.size} + ${ADDED_OVER_ELECTRON.length} added, Tauri handles ${tauri.size}${complete ? ' (complete)' : ''}`
);
