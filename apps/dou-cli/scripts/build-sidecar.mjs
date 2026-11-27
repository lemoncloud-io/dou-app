import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const outDir = resolve(process.argv[2] ?? join(root, 'apps/desktop-tauri/src-tauri/binaries'));
const POSTJECT = 'postject@1.0.0-alpha.6';
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

const npxCommand = () => {
    if (!windows) return ['npx', []];
    const cli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
    if (!existsSync(cli)) throw new Error(`${cli} is missing: install Node with npm`);
    return [process.execPath, [cli]];
};

const hostTriple = () => {
    const info = execFileSync('rustc', ['-vV'], { encoding: 'utf8' });
    const host = /^host: (.+)$/m.exec(info)?.[1];
    if (!host) throw new Error('rustc -vV did not print a host triple');
    return host;
};

const windows = process.platform === 'win32';
const macos = process.platform === 'darwin';
const target = join(outDir, `dou-cli-${hostTriple()}${windows ? '.exe' : ''}`);
const work = mkdtempSync(join(tmpdir(), 'dou-sea-'));
const config = join(work, 'sea.json');
const blob = join(work, 'sea.blob');
const bundle = join(work, 'main.cjs');
await build({
    entryPoints: [join(root, 'apps/dou-cli/src/main.ts')],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    tsconfig: join(root, 'apps/dou-cli/tsconfig.app.json'),
    outfile: bundle,
    logLevel: 'warning',
});
writeFileSync(config, JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true }));

execFileSync(process.execPath, ['--experimental-sea-config', config], { stdio: 'inherit' });
mkdirSync(outDir, { recursive: true });
copyFileSync(process.execPath, target);
if (macos) execFileSync('codesign', ['--remove-signature', target], { stdio: 'inherit' });
const inject = ['--yes', POSTJECT, target, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', FUSE];
if (macos) inject.push('--macho-segment-name', 'NODE_SEA');
const [npx, npxArgs] = npxCommand();
execFileSync(npx, [...npxArgs, ...inject], { stdio: 'inherit' });
if (macos) execFileSync('codesign', ['--sign', '-', target], { stdio: 'inherit' });
process.stdout.write(`${target}\n`);
