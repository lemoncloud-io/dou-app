import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { buildSync } from 'esbuild';

import type { ScenarioConfig } from './scenarios';

/** The names the runner looks for a project's scenario file under, in this order. */
export const CONFIG_FILES = [
    'chatic-apps.scenarios.ts',
    'chatic-apps.scenarios.mts',
    'chatic-apps.scenarios.js',
    'chatic-apps.scenarios.mjs',
];

/**
 * Reads the project's scenario file: bundled for Node, so it may be TypeScript and import the page's
 * own development data, then run. Its default export is the configuration; none at all is an empty one.
 */
export const loadScenarioConfig = (root: string): { config: ScenarioConfig; file: string | null } => {
    const file = CONFIG_FILES.find(name => existsSync(join(root, name))) ?? null;
    if (!file) return { config: {}, file: null };
    const result = buildSync({
        entryPoints: [join(root, file)],
        absWorkingDir: root,
        bundle: true,
        write: false,
        format: 'cjs',
        platform: 'node',
        target: 'node18',
        logLevel: 'silent',
        packages: 'external',
        loader: { '.css': 'empty' },
    });
    const module = { exports: {} as { default?: ScenarioConfig } };
    const run = new Function('module', 'exports', 'require', result.outputFiles[0].text);
    run(module, module.exports, createRequire(join(root, file)));
    return { config: module.exports.default ?? (module.exports as ScenarioConfig), file };
};
