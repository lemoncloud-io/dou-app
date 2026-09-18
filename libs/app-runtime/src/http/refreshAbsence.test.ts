import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ADR-0070 Decision 2, invariants 1·2 — running refresh is `ClientSocketAuth`'s alone.
 *
 * This repo now has **no** code that hits the refresh endpoint. So the old device that enforced
 * "only the legitimate caller invokes it" by a path pattern is replaced by an **absence** check —
 * the same approach `libs/http/src/gateways/refreshAbsence.spec.ts` takes for the gateway directory,
 * and much stronger: it catches the symbol no matter where it moves, no matter who creates a new file.
 *
 * The old device (ESLint no-restricted-imports) relied on path strings and died silently once the
 * symbol moved. An absence check has no such failure mode.
 */
const SRC = join(__dirname, '..');

const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap(entry => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return walk(full);
        return full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : [];
    });

describe('refresh 부재 게이트', () => {
    it('app-runtime 어디에도 refresh 엔드포인트 경로가 없다', () => {
        const offenders = walk(SRC)
            .filter(file => !file.endsWith(__filename.split('/').pop() as string))
            .filter(file => {
                const content = readFileSync(file, 'utf8');
                // Only real path strings, not comments — `/refresh` inside a template/string literal.
                return /["'`][^"'`\n]*\/refresh\b/.test(content);
            })
            .map(file => file.slice(SRC.length + 1));

        expect(offenders).toEqual([]);
    });
});
