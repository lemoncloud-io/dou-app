import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

import * as ts from 'typescript';

const SRC = __dirname;

const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap(entry => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        if (!/\.tsx?$/.test(entry) || /\.(test|spec)\.tsx?$/.test(entry)) return [];
        return [relative(SRC, path).split(sep).join('/')];
    });

const BARRELS = [
    '../index.ts',
    'facade.ts',
    'domain.ts',
    'boot.ts',
    'settings/index.ts',
    'session/index.ts',
    'connection/index.ts',
    'data/index.ts',
    'sync/index.ts',
    'push/index.ts',
    'report/index.ts',
];

const nonReexports = (file: string): string[] => {
    const source = ts.createSourceFile(file, readFileSync(join(SRC, file), 'utf8'), ts.ScriptTarget.Latest, true);
    return source.statements
        .filter(statement => !(ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined))
        .map(statement => `${file}: ${statement.getText(source).split('\n')[0].slice(0, 80)}`);
};

describe('the facade groups hold no logic of their own', () => {
    it('lists barrels that exist', () => {
        const files = sourceFiles(join(SRC, '..'));

        expect(BARRELS.filter(barrel => !files.includes(barrel))).toEqual([]);
    });

    it('has barrels made of re-exports and nothing else', () => {
        expect(BARRELS.flatMap(nonReexports)).toEqual([]);
    });

    it('keeps no hook or component anywhere in the package', () => {
        const reactShaped = sourceFiles(join(SRC, '..')).filter(
            file => file.endsWith('.tsx') || /(^|\/)use[A-Z]\w*\.ts$/.test(file)
        );

        expect(reactShaped).toEqual([]);
    });
});
