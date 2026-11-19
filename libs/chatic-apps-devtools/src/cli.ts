import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { check, formatCheck } from './check';
import { loadScenarioConfig } from './config';
import { loadDist } from './page';
import { SCENARIOS, formatScenarios, runScenarios, type ScenarioName } from './scenarios';

const USAGE = `Usage:
  chatic-apps check [--root <dir>] [--src <dir>] [--dist <dir>] [--json]
      Checks the manifest, the source and the built bundle against the rules.
  chatic-apps scenarios [--root <dir>] [--dist <dir>] [--mock <module>] [--only <name,...>] [--json]
      Runs the built page against the library's mock of the app, scenario by scenario.

Both exit with 1 when something fails. Run them from the project's folder after building it.`;

const option = (args: string[], name: string): string | undefined => {
    const at = args.indexOf(`--${name}`);
    return at === -1 ? undefined : args[at + 1];
};

const main = async (args: string[]): Promise<number> => {
    const [command] = args;
    const root = resolve(option(args, 'root') ?? '.');
    const dist = option(args, 'dist') ?? 'dist';
    const json = args.includes('--json');

    if (command === 'check') {
        const result = check({ root, src: option(args, 'src'), dist });
        console.log(json ? JSON.stringify(result, null, 2) : formatCheck(result));
        return result.ok ? 0 : 1;
    }

    if (command === 'scenarios') {
        const distDir = resolve(root, dist);
        const manifestPath = join(distDir, '.well-known', 'chatic-app.json');
        const manifest = existsSync(manifestPath)
            ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as { permissions?: unknown })
            : {};
        const permissions = Array.isArray(manifest.permissions) ? manifest.permissions.map(String) : [];
        const { config, file } = loadScenarioConfig(root);
        const only = option(args, 'only')?.split(',');
        const unknown = only?.filter(name => !Object.hasOwn(SCENARIOS, name)) ?? [];
        if (unknown.length) {
            console.error(`Unknown scenario(s): ${unknown.join(', ')}. Known: ${Object.keys(SCENARIOS).join(', ')}.`);
            return 2;
        }
        const results = await runScenarios({
            source: await loadDist(distDir),
            permissions,
            config,
            mockModule: option(args, 'mock'),
            resolveDir: root,
            only: only as ScenarioName[] | undefined,
        });
        if (!json && !file) console.log('No chatic-apps.scenarios.ts: screens and actions are not tried.\n');
        console.log(json ? JSON.stringify(results, null, 2) : formatScenarios(results));
        return results.every(result => result.problems.length === 0) ? 0 : 1;
    }

    console.log(USAGE);
    return command === undefined || command === '--help' ? 0 : 2;
};

main(process.argv.slice(2)).then(
    code => process.exit(code),
    error => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(2);
    }
);
