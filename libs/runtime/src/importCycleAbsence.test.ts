import { readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, normalize, relative } from 'path';

const LIBS = join(__dirname, '..', '..');
const ROOTS = [
    'runtime',
    'runtime/react',
    'runtime-client',
    'runtime-core',
    'runtime-web',
    'session',
    'transport',
    'sync',
    'auth',
].map(lib => join(LIBS, lib, 'src'));

const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap(entry => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        if (!/\.tsx?$/.test(entry) || /\.(test|spec)\.tsx?$/.test(entry)) return [];
        return [path];
    });

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

const valueImports = (file: string): string[] => {
    const source = readFileSync(file, 'utf8');
    const edges: string[] = [];

    const clauses = /(?:^|\n)\s*import\b([^;]*?)from\s*'([^']+)'/g;
    for (const [, clause, specifier] of source.matchAll(clauses)) {
        if (/^\s*type\s/.test(clause)) continue;
        if (!specifier.startsWith('.')) continue;
        const target = resolve(specifier, file);
        if (target) edges.push(target);
    }

    const bare = /(?:^|\n)\s*import\s*'(\.[^']+)'/g;
    for (const [, specifier] of source.matchAll(bare)) {
        const target = resolve(specifier, file);
        if (target) edges.push(target);
    }

    return edges;
};

const findCycles = (graph: Map<string, string[]>): string[][] => {
    const index = new Map<string, number>();
    const low = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const cycles: string[][] = [];
    let counter = 0;

    const visit = (node: string): void => {
        const own = counter;
        counter += 1;
        index.set(node, own);
        low.set(node, own);
        stack.push(node);
        onStack.add(node);

        let lowest = own;
        for (const next of graph.get(node) ?? []) {
            if (!index.has(next)) {
                visit(next);
                lowest = Math.min(lowest, low.get(next) ?? lowest);
            } else if (onStack.has(next)) {
                lowest = Math.min(lowest, index.get(next) ?? lowest);
            }
        }
        low.set(node, lowest);

        if (lowest === own) {
            const component: string[] = [];
            for (let member = stack.pop(); member !== undefined; member = stack.pop()) {
                onStack.delete(member);
                component.push(member);
                if (member === node) break;
            }
            if (component.length > 1) cycles.push(component);
        }
    };

    for (const node of graph.keys()) if (!index.has(node)) visit(node);
    return cycles;
};

describe('runtime — 순환 import 부재', () => {
    it('소스 파일 사이에 값 import 순환이 없다', () => {
        const files = ROOTS.flatMap(sourceFiles);
        const graph = new Map(files.map(file => [file, valueImports(file)]));

        const cycles = findCycles(graph)
            .map(component => component.map(file => relative(LIBS, file)).sort())
            .sort((left, right) => left[0].localeCompare(right[0]));

        expect(cycles).toEqual([]);
    });
});
