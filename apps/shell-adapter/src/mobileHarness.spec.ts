import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

import { HARNESS_GLOBAL } from './checkout';

const fromRepo = (file: string) => fileURLToPath(new URL(`../../../${file}`, import.meta.url));

const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        return /\.(ts|tsx|js)$/.test(name) ? [path] : [];
    });

describe('the mobile app, which must never pick the shell-only checkout', () => {
    it('declares its device store only, never the web', async () => {
        const { hostCapabilities } = await import(fromRepo('apps/mobile/src/app/webview/utils/hostCapabilities.ts'));
        expect(hostCapabilities('ios').checkout).toEqual(['apple']);
        expect(hostCapabilities('android').checkout).toEqual(['google']);
    });

    it(`injects no ${HARNESS_GLOBAL}, so its web never reads harness values`, () => {
        const naming = sourceFiles(fromRepo('apps/mobile/src')).filter(file =>
            readFileSync(file, 'utf8').includes(HARNESS_GLOBAL)
        );
        expect(naming).toEqual([]);
    });
});
