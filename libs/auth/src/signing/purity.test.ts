import { readFileSync, readdirSync } from 'fs';
import { dirname, join, resolve, sep } from 'path';

/**
 * This folder must stay a platform-neutral leaf inside `@chatic/auth`: it imports no package but
 * `crypto-js` (so no `@chatic/*` or `@lemoncloud/*`), nothing from the rest of this package (no relative
 * path out of the folder), and reads no global (`navigator`, the clock). The formula then depends on
 * its arguments and `crypto-js` alone, and the folder can leave this package in one move — into the
 * sockets SDK, say — without taking a session or a transport along. See
 * libs/auth/docs/socket/signing.md § The formula.
 * Enforced by absence, not by a runtime check. Test files are left out: they may import what they need.
 */
function nonTestSourceFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...nonTestSourceFiles(full));
            continue;
        }
        if (entry.name.endsWith('.ts') && !/\.(test|spec)\.ts$/.test(entry.name)) files.push(full);
    }
    return files;
}

// Comments go first. The rules are described in prose next to the fields they protect, and those
// sentences name `navigator` and quote paths, which would otherwise trip the gate on itself.
const codeOf = (file: string): string =>
    readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');

// Static imports and re-exports (`from '…'`), side-effect imports, `import('…')` and `require('…')`.
const importSpecifiers = (code: string): string[] =>
    [...code.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]/g)].map(
        match => match[1] ?? match[2]
    );

// The formula's one dependency; everything else it needs comes in as an argument.
const ALLOWED_PACKAGE = /^crypto-js(\/|$)/;

describe('signing purity gate', () => {
    const files = nonTestSourceFiles(__dirname);

    it('finds the sources it guards', () => {
        // A gate that scans nothing passes forever; pin that it still sees the formula.
        expect(files.map(file => file.slice(__dirname.length + 1)).sort()).toEqual([
            'LemonHmacSigner.ts',
            'contracts.ts',
            'index.ts',
        ]);
    });

    it('imports no package but crypto-js', () => {
        // Covers `@chatic/*`, `@lemoncloud/*`, and a path resolved through the root `baseUrl`.
        const offenders = files.filter(file =>
            importSpecifiers(codeOf(file)).some(spec => !spec.startsWith('.') && !ALLOWED_PACKAGE.test(spec))
        );

        expect(offenders).toEqual([]);
    });

    it('imports nothing from the rest of the package', () => {
        const offenders = files.filter(file =>
            importSpecifiers(codeOf(file))
                .filter(spec => spec.startsWith('.'))
                .some(spec => !resolve(dirname(file), spec).startsWith(__dirname + sep))
        );

        expect(offenders).toEqual([]);
    });

    it('reads no global (navigator, the clock) for signing material', () => {
        const offenders = files.filter(file =>
            /\bnavigator\b|\bnew Date\(|\bDate\.now\(|\bperformance\.now\(/.test(codeOf(file))
        );

        expect(offenders).toEqual([]);
    });
});
