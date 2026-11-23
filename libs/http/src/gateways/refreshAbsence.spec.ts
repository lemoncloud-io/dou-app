import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

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
