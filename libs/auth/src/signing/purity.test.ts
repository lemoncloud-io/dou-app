import { readFileSync, readdirSync } from 'fs';
import { dirname, join, resolve, sep } from 'path';

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

const codeOf = (file: string): string =>
    readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');

const importSpecifiers = (code: string): string[] =>
    [...code.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]/g)].map(
        match => match[1] ?? match[2]
    );

const ALLOWED_PACKAGE = /^crypto-js(\/|$)/;

describe('signing purity gate', () => {
    const files = nonTestSourceFiles(__dirname);

    it('finds the sources it guards', () => {
        expect(files.map(file => file.slice(__dirname.length + 1)).sort()).toEqual([
            'LemonHmacSigner.ts',
            'contracts.ts',
            'index.ts',
        ]);
    });

    it('imports no package but crypto-js', () => {
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
