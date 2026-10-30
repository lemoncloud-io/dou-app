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
 * The layers, bottom up. The session layer — the store, its signal and the scope views — has already
 * left for `@chatic/session`, which every layer here may import; the package graph keeps it below.
 *
 * - `base` — `utils/`: helpers that import nothing from this package. They leave with the first
 *   module that needs them.
 * - `transport` — the socket manager and its slots, and the HTTP manager.
 * - `sync` and `auth` — side by side. Sync keeps clouds current; auth logs in, switches, renews and
 *   pairs. Neither may import the other, because each will be a package of its own.
 * - `app` — what stays here: the repository graph's assembly, every React hook and component, push,
 *   report and boot. It may import everything.
 *
 * Unlike the cycle check, a type-only import IS an edge here: a package that names another's type
 * has to depend on it, so `import type` across the line is as much a violation as a value. Tests are
 * left out — a scenario test that drives several layers together lives with the layer that owns it.
 */
const SRC = join(__dirname);

type Layer = 'base' | 'transport' | 'sync' | 'auth' | 'app';

const ALLOWED: Record<Layer, readonly Layer[]> = {
    base: [],
    transport: ['base'],
    sync: ['base', 'transport'],
    auth: ['base', 'transport'],
    app: ['base', 'transport', 'sync', 'auth'],
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
    if (/^socket\/[^/]+\.tsx?$/.test(path) || path.startsWith('socket/utils/') || path.startsWith('http/')) {
        return 'transport';
    }
    if (path.startsWith('socket/sync/')) return 'sync';
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
        expect(at('socket/SocketManager.ts')).toBe('transport');
        expect(at('socket/socketVerifyTrace.ts')).toBe('transport');
        expect(at('http/factory.ts')).toBe('transport');
        expect(at('socket/sync/plans.ts')).toBe('sync');
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
        expect(edges('socket/sync/plans.ts')).toContain('socket/sync/dataGraph.ts');
        expect(edges('session/auth/cloudTokens.ts')).toContain('session/auth/authRepository.ts');
        expect(edges('socket/index.ts')).toEqual(['socket/types.ts']);
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
});
