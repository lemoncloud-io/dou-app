import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * ADR-0070 결정 2 불변조건 1·2 — refresh 실행은 `ClientSocketAuth`만. Gateways enforce this by
 * absence, not by a runtime check: no `/refresh` (or `/oauth/{authId}/refresh`) path string may
 * exist anywhere in this directory. CI-gate counterpart to
 * libs/data/docs/http-data-path.md §설계 원칙 4.
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
