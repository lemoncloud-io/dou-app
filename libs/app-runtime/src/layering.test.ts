import { readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, normalize, relative, sep } from 'path';

/**
 * Every folder in this package belongs to one layer, and a layer imports only the layers it is
 * allowed to.
 *
 * **Why layers and not just "no cycles".** [`importCycleAbsence.test.ts`](./importCycleAbsence.test.ts)
 * proves no file reaches back to itself, which is enough for one package and not enough to split it.
 * The layers below are the packages this one is being cut into, so a folder that imports across them
 * the wrong way is an edge the split would have to break. Holding the line here first is what turns
 * each later extraction into a move rather than a redesign.
 *
 * The layers, bottom up. Three have already left as packages every layer here may import, and the
 * package graph keeps them below: the session — the store, its signal and the scope views — is
 * `@chatic/session`; the transport — the socket manager and its slots, and the HTTP manager — is
 * `@chatic/transport`; and sync — the sync manager, its plans and the background receive — is
 * `@chatic/sync`.
 *
 * - `base` — `utils/`: helpers that import nothing from this package. They leave with the first
 *   module that needs them.
 * - `auth` — logs in, switches, renews and pairs. It will be a package of its own, and sync sits
 *   beside it, not below: auth imports nothing from `@chatic/sync`.
 * - `app` — what stays here: the repository graph's assembly, every React hook and component, push,
 *   report and boot. It may import everything.
 *
 * Unlike the cycle check, a type-only import IS an edge here: a package that names another's type
 * has to depend on it, so `import type` across the line is as much a violation as a value. Tests are
 * left out — a scenario test that drives several layers together lives with the layer that owns it.
 */
const SRC = join(__dirname);

type Layer = 'base' | 'auth' | 'app';

const ALLOWED: Record<Layer, readonly Layer[]> = {
    base: [],
    auth: ['base'],
    app: ['base', 'auth'],
};

/**
 * The facade's group barrels, read off `facade.ts`. A group barrel publishes to apps — `sync` sells
 * its hooks next to its manager — so it belongs to the app layer even when it sits in a lower
 * layer's folder.
 */
const GROUP_BARRELS = new Set(
    [...readFileSync(join(SRC, 'facade.ts'), 'utf8').matchAll(/export \* as \w+ from '\.\/([^']+)'/g)].flatMap(
        ([, path]) => [`${path}.ts`, `${path}/index.ts`]
    )
);

/** Hooks are React, and React is the app layer wherever the folder that holds them sits. */
const layerOf = (file: string): Layer => {
    const path = relative(SRC, file).split(sep).join('/');
    if (GROUP_BARRELS.has(path) || /(^|\/)hooks\//.test(path)) return 'app';
    if (path.startsWith('utils/')) return 'base';
    if (/^(session\/(auth|pairing)|socket\/auth)\//.test(path)) return 'auth';
    return 'app';
};

const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap(entry => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        if (!/\.tsx?$/.test(entry) || /\.(test|spec)\.tsx?$/.test(entry)) return [];
        return [path];
    });

/** Mirrors the resolution a bundler does for a relative specifier: file first, then the directory barrel. */
const resolve = (specifier: string, from: string): string | null => {
    const base = normalize(join(dirname(from), specifier));
    for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
        try {
            if (statSync(candidate).isFile()) return candidate;
        } catch {
            // Not this candidate — keep trying.
        }
    }
    return null;
};

/** Every relative `import … from` and `export … from`, type-only ones included. */
const relativeEdges = (file: string): string[] => {
    const source = readFileSync(file, 'utf8');
    const statements = /(?:^|\n)\s*(?:import|export)\b[^;]*?from\s*'(\.[^']+)'|(?:^|\n)\s*import\s*'(\.[^']+)'/g;
    return [...source.matchAll(statements)]
        .map(([, specifier, bare]) => resolve(specifier ?? bare, file))
        .filter((target): target is string => target !== null);
};

describe('app-runtime — layering', () => {
    it('places a few known files in the layer the split gives them', () => {
        const at = (path: string) => layerOf(join(SRC, path));
        expect(at('utils/coalescer.ts')).toBe('base');
        expect(at('socket/sync/hooks/useSyncTarget.ts')).toBe('app');
        expect(at('socket/sync/index.ts')).toBe('app');
        expect(at('session/auth/relaySession.ts')).toBe('auth');
        expect(at('session/pairing/pairedClouds.ts')).toBe('auth');
        expect(at('socket/auth/renewers.ts')).toBe('auth');
        expect(at('data/DataManager.ts')).toBe('app');
        expect(at('session/index.ts')).toBe('app');
    });

    it('reads the edges it judges, type-only imports and barrels included', () => {
        // A positive control: if the statement pattern or the resolver broke, every file would have
        // no edges and the check below would pass on nothing.
        const edges = (path: string) => relativeEdges(join(SRC, path)).map(target => relative(SRC, target));
        expect(edges('session/auth/cloudTokens.ts')).toContain('session/auth/authRepository.ts');
        expect(edges('connection/index.ts')).toContain('socket/auth/recoverUnverifiedSockets.ts');
    });

    it('imports only from its own layer or the layers below it', () => {
        const violations = sourceFiles(SRC).flatMap(file => {
            const from = layerOf(file);
            return relativeEdges(file)
                .filter(target => {
                    const to = layerOf(target);
                    return to !== from && !ALLOWED[from].includes(to);
                })
                .map(target => `${relative(SRC, file)} (${from}) -> ${relative(SRC, target)} (${layerOf(target)})`);
        });

        // Listed whole so a regression names the edge instead of only failing a count.
        expect(violations.sort()).toEqual([]);
    });

    it('keeps auth off @chatic/sync, which sits beside it rather than below', () => {
        // A package import is not a relative edge, so the check above cannot see this one.
        // `from`, a bare side-effect import and a dynamic `import()` all count.
        const importsSync = (source: string) => /(?:from\s*|import\s*\(?\s*)'@chatic\/sync(?:\/[^']*)?'/.test(source);
        expect(importsSync("import { getSyncManager } from '@chatic/sync';")).toBe(true);
        expect(importsSync("import '@chatic/sync/runtime';")).toBe(true);
        expect(importsSync("await import('@chatic/sync')")).toBe(true);
        expect(importsSync("import { x } from '@chatic/syncx';")).toBe(false);

        const authFiles = sourceFiles(SRC).filter(file => layerOf(file) === 'auth');
        // If the layer mapping broke, an empty list would pass on nothing.
        expect(authFiles.length).toBeGreaterThan(0);

        const offenders = authFiles
            .filter(file => importsSync(readFileSync(file, 'utf8')))
            .map(file => relative(SRC, file));
        expect(offenders).toEqual([]);
    });
});
