import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const LIBS = join(__dirname, '..', '..');
const ROOTS = ['runtime', 'runtime-client', 'runtime-core', 'runtime-web', 'session', 'transport', 'sync', 'auth'].map(
    lib => join(LIBS, lib, 'src')
);

const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap(entry => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return walk(full);
        return full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : [];
    });

describe('refresh 부재 게이트', () => {
    it('runtime 어디에도 refresh 엔드포인트 경로가 없다', () => {
        const offenders = ROOTS.flatMap(walk)
            .filter(file => !file.endsWith(__filename.split('/').pop() as string))
            .filter(file => {
                const content = readFileSync(file, 'utf8');
                return /["'`][^"'`\n]*\/refresh\b/.test(content);
            })
            .map(file => file.slice(LIBS.length + 1));

        expect(offenders).toEqual([]);
    });
});
