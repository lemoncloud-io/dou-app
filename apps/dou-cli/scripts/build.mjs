import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const { fcmDefine, pushProtos } = createRequire(import.meta.url)('./bundle-options.cjs');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

await build({
    entryPoints: [join(root, 'apps/dou-cli/src/main.ts')],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    tsconfig: join(root, 'apps/dou-cli/tsconfig.app.json'),
    outfile: join(root, 'dist/apps/dou-cli/main.mjs'),
    plugins: [pushProtos],
    define: fcmDefine(process.env),
    logLevel: 'warning',
});
