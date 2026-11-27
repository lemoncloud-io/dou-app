import { readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, normalize, relative, sep } from 'path';

const SRC = __dirname;

const LAYERS = ['engine', 'remote', 'api', 'declare'] as const;

type Layer = (typeof LAYERS)[number] | 'entry' | 'testing';

const ALLOWED: Record<Layer, readonly Layer[]> = {
    engine: [],
    remote: ['engine'],
    api: ['engine', 'remote'],
    declare: ['engine', 'remote', 'api'],
    entry: ['engine', 'remote', 'api', 'declare', 'testing'],
    testing: ['engine', 'remote', 'api', 'declare', 'entry'],
};

const pathOf = (file: string): string => relative(SRC, file).split(sep).join('/');

const layerOf = (file: string): Layer => {
    const path = pathOf(file);
    if (/(^|\/)testing\//.test(path)) return 'testing';
    const top = path.split('/')[0];
    return (LAYERS as readonly string[]).includes(top) ? (top as Layer) : 'entry';
};

const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap(entry => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) return entry === '__mocks__' ? [] : sourceFiles(path);
        if (!/\.tsx?$/.test(entry) || /\.(test|spec)\.tsx?$/.test(entry)) return [];
        return [path];
    });

const resolve = (specifier: string, from: string): string | null => {
    const base = normalize(join(dirname(from), specifier));
    for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
        try {
            if (statSync(candidate).isFile()) return candidate;
        } catch {
            continue;
        }
    }
    return null;
};

const relativeEdges = (file: string): string[] => {
    const source = readFileSync(file, 'utf8');
    const statements =
        /(?:^|\n)\s*(?:import|export)\b[^;]*?from\s*'(\.[^']+)'|(?:^|\n)\s*import\s*'(\.[^']+)'|import\(\s*'(\.[^']+)'\s*\)/g;
    return [...source.matchAll(statements)]
        .map(([, specifier, bare, dynamic]) => resolve(specifier ?? bare ?? dynamic, file))
        .filter((target): target is string => target !== null);
};

describe('@chatic/runtime — layering', () => {
    it('places a few known files in their layer', () => {
        const at = (path: string) => layerOf(join(SRC, path));
        expect(at('engine/createRuntime.ts')).toBe('engine');
        expect(at('engine/session/sessionController.ts')).toBe('engine');
        expect(at('remote/host.ts')).toBe('remote');
        expect(at('remote/mirror/mirrorEngine.ts')).toBe('remote');
        expect(at('api/init.ts')).toBe('api');
        expect(at('api/facade.ts')).toBe('api');
        expect(at('declare/startRuntime.ts')).toBe('declare');
        expect(at('declare/sessionStorageBoot.ts')).toBe('declare');
        expect(at('index.ts')).toBe('entry');
        expect(at('testing/index.ts')).toBe('testing');
        expect(at('engine/testing/sessionView.ts')).toBe('testing');
    });

    it('finds files in every layer', () => {
        const layers = new Set(sourceFiles(SRC).map(layerOf));
        expect([...LAYERS].filter(layer => !layers.has(layer))).toEqual([]);
    });

    it('reads the edges it judges, type-only imports and re-exports included', () => {
        const edges = (path: string) => relativeEdges(join(SRC, path)).map(pathOf);
        expect(edges('remote/index.ts')).toContain('remote/host.ts');
        expect(edges('api/index.ts')).toContain('engine/index.ts');
        expect(edges('declare/sessionStorageBoot.ts')).toContain('engine/index.ts');
        expect(edges('index.ts')).toContain('api/facade.ts');
    });

    it('imports only from its own layer or the layers below it: engine ← remote ← api ← declare', () => {
        const violations = sourceFiles(SRC).flatMap(file => {
            const from = layerOf(file);
            return relativeEdges(file)
                .filter(target => {
                    const to = layerOf(target);
                    return to !== from && !ALLOWED[from].includes(to);
                })
                .map(target => `${pathOf(file)} (${from}) -> ${pathOf(target)} (${layerOf(target)})`);
        });

        expect(violations.sort()).toEqual([]);
    });
});
