import type { SyncDataGraph } from './dataGraph';
import { syncDataGraph } from './dataGraph';

const graph = (): SyncDataGraph => ({ getScopedRepositories: jest.fn(), getScopedContext: jest.fn() });

describe('syncDataGraph', () => {
    afterEach(() => syncDataGraph.provide(null));

    it('throws a message naming initAppRuntime when nothing was provided', () => {
        expect(() => syncDataGraph.get()).toThrow(/initAppRuntime/);
    });

    it('reads through the accessor on every call, so a graph built later is the one returned', () => {
        const first = graph();
        const second = graph();
        let current = first;
        syncDataGraph.provide(() => current);

        expect(syncDataGraph.get()).toBe(first);
        current = second;
        expect(syncDataGraph.get()).toBe(second);
    });

    it('is unwired again after provide(null)', () => {
        syncDataGraph.provide(graph);
        syncDataGraph.provide(null);

        expect(() => syncDataGraph.get()).toThrow(/initAppRuntime/);
    });
});
