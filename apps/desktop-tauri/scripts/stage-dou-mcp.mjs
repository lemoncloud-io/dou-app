import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(process.argv[2] ?? join(app, 'src-tauri/binaries'));
const windows = process.platform === 'win32';
const host = /^host: (.+)$/m.exec(execFileSync('rustc', ['-vV'], { encoding: 'utf8' }))?.[1];
if (!host) throw new Error('rustc -vV did not print a host triple');

execFileSync('cargo', ['build', '--release', '-p', 'dou-tauri', '--bin', 'dou-mcp'], { cwd: app, stdio: 'inherit' });
mkdirSync(outDir, { recursive: true });
const suffix = windows ? '.exe' : '';
const target = join(outDir, `dou-mcp-${host}${suffix}`);
copyFileSync(join(app, 'target/release', `dou-mcp${suffix}`), target);
process.stdout.write(`${target}\n`);
