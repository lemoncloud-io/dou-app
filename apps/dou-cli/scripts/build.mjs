import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const { douCliBuild } = createRequire(import.meta.url)('./bundle-options.cjs');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

await build(
    douCliBuild(root, {
        format: 'esm',
        banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
        outfile: join(root, 'dist/apps/dou-cli/main.mjs'),
    })
);
