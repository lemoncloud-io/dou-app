import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

import * as ts from 'typescript';

/**
 * `@chatic/runtime` is a facade: hooks, components and re-exports. The logic they wrap is in
 * `@chatic/runtime-client` (React-free) or the core packages, where it is tested without React and
 * where a second UI could reach it. These checks hold the package to that, by reading its source.
 */
const SRC = __dirname;

const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap(entry => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        if (!/\.tsx?$/.test(entry) || /\.(test|spec)\.tsx?$/.test(entry)) return [];
        return [relative(SRC, path).split(sep).join('/')];
    });

/** The barrels the facade is assembled from: the entry, the group list, and each group's catalog. */
const BARRELS = [
    'index.ts',
    'facade.ts',
    'domain.ts',
    'boot.ts',
    'settings.ts',
    'session/index.ts',
    'connection/index.ts',
    'data/index.ts',
    'socket/sync/index.ts',
    'push/index.ts',
    'report/index.ts',
];

/**
 * Files with logic of their own that predate this rule. Each is to move into runtime-client or below,
 * and leaves this list when it does; nothing is added to it.
 */
const LOGIC_STILL_TO_MOVE = ['report/reportIssue.ts', 'session/pageDevice.ts', 'utils/isNativeApp.ts'];

/** Top-level statements that are not a re-export (`export … from '…'`), as `file: text`. */
const nonReexports = (file: string): string[] => {
    const source = ts.createSourceFile(file, readFileSync(join(SRC, file), 'utf8'), ts.ScriptTarget.Latest, true);
    return source.statements
        .filter(statement => !(ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined))
        .map(statement => `${file}: ${statement.getText(source).split('\n')[0].slice(0, 80)}`);
};

describe('@chatic/runtime holds no logic of its own', () => {
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
            // A test's fake, not the facade: it is loaded only by tests (`@chatic/runtime/testing`).
            .filter(file => !file.startsWith('testing/'))
            .filter(file => !file.split('/').includes('hooks') && !file.endsWith('.tsx'))
            .sort();

        // Shrinks only: a file that moves out leaves the list, and a new one with logic belongs in
        // runtime-client instead.
        expect(others).toEqual([...LOGIC_STILL_TO_MOVE].sort());
    });
});
