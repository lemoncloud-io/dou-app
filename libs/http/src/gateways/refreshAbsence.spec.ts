import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * ADR-0070 decision 2, invariants 1-2 — only `ClientSocketAuth` executes refresh. Gateways enforce this by
 * absence, not by a runtime check: no `/refresh` (or `/oauth/{authId}/refresh`) path string may
 * exist anywhere in this directory. CI-gate counterpart to
 * libs/data/docs/remote/http.md#gateway-pick.
 */
describe('gateways refresh-absence gate', () => {
    it('no gateway source file contains a refresh endpoint path', () => {
        const dir = __dirname;
        const offenders: string[] = [];

        for (const file of readdirSync(dir)) {
            if (!file.endsWith('.ts') || file.endsWith('.spec.ts')) continue;
            const content = readFileSync(join(dir, file), 'utf8');
            if (/\/refresh\b/.test(content)) offenders.push(file);
        }

        expect(offenders).toEqual([]);
    });
});
