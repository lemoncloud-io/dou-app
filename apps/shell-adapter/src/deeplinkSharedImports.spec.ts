import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const fromRepo = (file: string) => fileURLToPath(new URL(`../../../${file}`, import.meta.url));
const SHARED_FOR_DEEPLINKS = fromRepo('libs/shared/src/utils/index.ts');
const deeplinkSource = readFileSync(fromRepo('libs/host/mobile/src/deeplinks/deeplinkUtils.ts'), 'utf8');

const sharedValueImports = [
    ...deeplinkSource.matchAll(/(?:import|export)\s*\{([^}]*)\}\s*from\s*['"]@chatic\/shared['"]/g),
]
    .flatMap(([, names]) => names.split(','))
    .map(name => name.trim())
    .filter(name => name && !name.startsWith('type '))
    .map(name => name.split(/\s+as\s+/)[0]);

describe("the mobile deeplink module's @chatic/shared imports", () => {
    it('are found', () => {
        expect(sharedValueImports.length).toBeGreaterThan(0);
    });

    it.each(sharedValueImports)('%s is served by the shared utils barrel the alias points at', async name => {
        const utils: Record<string, unknown> = await import(SHARED_FOR_DEEPLINKS);

        expect(
            utils[name],
            `${name} is not exported by libs/shared/src/utils; the shell reaches @chatic/shared from deeplinkUtils.ts through that barrel only`
        ).toBeDefined();
    });
});
