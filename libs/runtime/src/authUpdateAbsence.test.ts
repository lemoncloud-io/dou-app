import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const LIBS = join(__dirname, '..', '..');
const ROOTS = [
    'runtime',
    'runtime/react',
    'runtime-client',
    'runtime-core',
    'runtime-web',
    'runtime-hybrid-web',
    'session',
    'transport',
    'sync',
    'auth',
].map(lib => join(LIBS, lib, 'src'));

const SELF = __filename.split('/').pop() as string;

const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap(entry => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return walk(full);
        return full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : [];
    });

const stripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('auth.update 부재 게이트', () => {
    it('runtime 어디에도 auth.update 패킷을 짓는 코드가 없다', () => {
        const offenders = ROOTS.flatMap(walk)
            .filter(file => !file.endsWith(SELF))
            .filter(file => {
                const code = stripComments(readFileSync(file, 'utf8'));
                return /["'`]auth\.update(?!:)["'`]/.test(code);
            })
            .map(file => file.slice(LIBS.length + 1));

        expect(offenders).toEqual([]);
    });
});
