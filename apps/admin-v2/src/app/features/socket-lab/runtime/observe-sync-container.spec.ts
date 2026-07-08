/**
 * `runtime/observe-sync-container.spec.ts`
 */
import { describe, expect, it } from 'vitest';

import { diffTargets } from './observe-sync-container';

describe('observe-sync-container', () => {
    describe('diffTargets', () => {
        it('should start only new ids and stop only removed ids', () => {
            const desired = new Set(['a', 'b', 'c']);
            const applied = new Set(['b', 'c', 'd']);
            const { start, stop } = diffTargets(desired, applied);
            expect(start).toEqual(['a']);
            expect(stop).toEqual(['d']);
        });

        it('should be no-op when sets are equal', () => {
            const ids = new Set(['a', 'b']);
            const { start, stop } = diffTargets(ids, new Set(ids));
            expect(start).toEqual([]);
            expect(stop).toEqual([]);
        });

        it('should stop everything when desired is empty', () => {
            const { start, stop } = diffTargets(new Set(), new Set(['a', 'b']));
            expect(start).toEqual([]);
            expect(stop).toEqual(['a', 'b']);
        });
    });
});
