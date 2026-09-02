import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * ADR-0070 설계 원칙 — this lib must stay a platform-neutral leaf: zero `@chatic/*`/`@lemoncloud/*`
 * runtime deps, and no global reads (`navigator`, `new Date(`). Enforced by absence, not by a
 * runtime check (libs/auth-sign/docs/architecture.md §검증 방법 — 의존 0 게이트 · 전역 무접근 게이트).
 * The lemon-web-core equivalence test in LemonHmacSigner.spec.ts is the one intentional exception,
 * hence non-spec files only.
 */
function nonSpecSourceFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...nonSpecSourceFiles(full));
            continue;
        }
        if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) files.push(full);
    }
    return files;
}

describe('auth-sign purity gate', () => {
    const files = nonSpecSourceFiles(join(__dirname));

    it('has no @chatic/* or @lemoncloud/* import', () => {
        const offenders = files.filter(file => /from\s+['"](@chatic|@lemoncloud)\//.test(readFileSync(file, 'utf8')));

        expect(offenders).toEqual([]);
    });

    it('reads no global (navigator, new Date()) for signing material', () => {
        // Strip comments first — the constraint is documented in prose (e.g. "전역(navigator) 읽기
        // 금지") right next to the fields it protects, which would otherwise self-trigger this gate.
        const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        const offenders = files.filter(file =>
            /\bnavigator\b|\bnew Date\(/.test(stripComments(readFileSync(file, 'utf8')))
        );

        expect(offenders).toEqual([]);
    });
});
