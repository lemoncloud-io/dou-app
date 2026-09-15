import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * This lib must stay a platform-neutral leaf: zero `@chatic/*`/`@lemoncloud/*` runtime deps, and no
 * global reads (`navigator`, `new Date(`) — design principles 1 and 3 in libs/auth-sign/README.md.
 * Enforced by absence, not by a runtime check. The lemon-web-core equivalence test in
 * LemonHmacSigner.spec.ts is the one intentional exception, hence non-spec files only.
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
        // Strip comments first. The constraint is described in prose next to the fields it
        // protects, and those sentences name `navigator`, which would self-trigger this gate.
        const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        const offenders = files.filter(file =>
            /\bnavigator\b|\bnew Date\(/.test(stripComments(readFileSync(file, 'utf8')))
        );

        expect(offenders).toEqual([]);
    });
});
