import { readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, normalize, relative } from 'path';

/**
 * There is no import cycle inside this package.
 *
 * **Why an absence check and not a lint rule.** Both cycles this test was written for were invisible
 * until the graph was drawn. `sessionDelegate` → `renewers` → `renewCloudSession` → `sessionDelegate`
 * was introduced by ADR-0076 itself, while its own doc argued at length about which folder may import
 * which — and `renewers.ts` instantiates two classes at module load, so that ring had construction
 * inside it. The other spanned both engines (`socket/runtime` → `SyncManager` → `plans` →
 * `data/runtime` → `DataManager` → `socketFactory` → `socket/runtime`) and survived every review of
 * the two ADRs that built it.
 *
 * Neither broke at runtime — every offending reference sat inside a function body, so the
 * partially-initialised module was fully populated by the time anything read it. That is exactly what
 * makes them dangerous: the failure appears later, when someone moves one of those reads to module
 * scope and gets `undefined` in an order-dependent way.
 *
 * Same reasoning as [`refreshAbsence.test.ts`](./http/refreshAbsence.test.ts) and
 * [`authUpdateAbsence.test.ts`](./socket/authUpdateAbsence.test.ts): the path-based lint rule this
 * package used to carry died silently when a symbol moved, and an absence check has no such failure
 * mode — it re-measures the tree every run. The one-off script that first found these cycles got the
 * count WRONG (a greedy regex swallowed intermediate import lines), which is the other half of the
 * argument for measuring in the suite rather than by hand.
 *
 * Scope: relative `import` statements between source files, which is where a cycle can carry a value.
 * Statement-level `import type` is erased at compile time (that erasure is load-bearing — see
 * [`http/credentialRecovery.ts`](./http/credentialRecovery.ts), whose type-only import is the one
 * thing keeping `data` → `http` → `session` open) and is therefore not an edge. Tests are excluded:
 * a test importing its own subject is not a cycle in the shipped graph.
 */
const SRC = join(__dirname);

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

const valueImports = (file: string): string[] => {
    const source = readFileSync(file, 'utf8');
    const edges: string[] = [];

    // One statement at a time. `[^;]` is the bound — every import in this package ends in a
    // semicolon — so a match can never run from one `import` past its own statement into a later
    // one's specifier. An earlier attempt used a lazy `[\s\S]*?` instead and did exactly that:
    // it read `import { logger } from '@chatic/bridges'` followed by `import type { X } from './x'`
    // as a single value edge to `./x`. Statement bounds are what make the `type` check below mean
    // anything.
    const clauses = /(?:^|\n)\s*import\b([^;]*?)from\s*'([^']+)'/g;
    for (const [, clause, specifier] of source.matchAll(clauses)) {
        if (/^\s*type\s/.test(clause)) continue; // erased at compile time — not an edge
        if (!specifier.startsWith('.')) continue; // package import — outside this graph
        const target = resolve(specifier, file);
        if (target) edges.push(target);
    }

    // Side-effect imports (`import './x';`) carry no specifier but do carry the module's load, so
    // they are edges too. Kept as its own pass because the clause form above requires a `from`.
    const bare = /(?:^|\n)\s*import\s*'(\.[^']+)'/g;
    for (const [, specifier] of source.matchAll(bare)) {
        const target = resolve(specifier, file);
        if (target) edges.push(target);
    }

    return edges;
};

/** Tarjan — reports every strongly connected component larger than one node. */
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

        // Root of its component: everything above it on the stack belongs to that component.
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

describe('app-runtime — 순환 import 부재', () => {
    it('소스 파일 사이에 값 import 순환이 없다', () => {
        const files = sourceFiles(SRC);
        const graph = new Map(files.map(file => [file, valueImports(file)]));

        const cycles = findCycles(graph)
            .map(component => component.map(file => relative(SRC, file)).sort())
            .sort((left, right) => left[0].localeCompare(right[0]));

        // Compared as whole components so a regression names the ring instead of only failing a count.
        expect(cycles).toEqual([]);
    });
});
