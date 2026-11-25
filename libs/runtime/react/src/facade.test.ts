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
    'index.ts',
    'facade.ts',
    'settings.ts',
    'session/index.ts',
    'connection/index.ts',
    'data/index.ts',
    'socket/sync/index.ts',
    'push/index.ts',
];

const nonReexports = (file: string): string[] => {
    const source = ts.createSourceFile(file, readFileSync(join(SRC, file), 'utf8'), ts.ScriptTarget.Latest, true);
    return source.statements
        .filter(statement => !(ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined))
        .map(statement => `${file}: ${statement.getText(source).split('\n')[0].slice(0, 80)}`);
};

describe('@chatic/runtime-react holds no logic of its own', () => {
    it('lists barrels that exist', () => {
        const files = sourceFiles(SRC);

        expect(BARRELS.filter(barrel => !files.includes(barrel))).toEqual([]);
    });

    it('has barrels made of re-exports and nothing else', () => {
        expect(BARRELS.flatMap(nonReexports)).toEqual([]);
    });

    it('keeps every other source file a hook or a component', () => {
        const others = sourceFiles(SRC)
            .filter(file => !BARRELS.includes(file))
            .filter(file => !file.startsWith('testing/'))
            .filter(file => !file.split('/').includes('hooks') && !file.endsWith('.tsx'));

        expect(others).toEqual([]);
    });
});
