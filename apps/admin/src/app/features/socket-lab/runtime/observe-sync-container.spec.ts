/**
 * `runtime/observe-sync-container.spec.ts`
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { diffTargets, getObserveWsUrl } from './observe-sync-container';

describe('observe-sync-container', () => {
    describe('getObserveWsUrl', () => {
        afterEach(() => vi.unstubAllEnvs());

        it("uses each stage's own socket with the v2 flag", () => {
            vi.stubEnv('VITE_D1_WS_ENDPOINT', 'wss://dev.example.com/cht-d1');
            vi.stubEnv('VITE_V1_WS_ENDPOINT', 'wss://prod.example.com/cht-v1/');

            expect(getObserveWsUrl('d1')).toBe('wss://dev.example.com/cht-d1?v2');
            expect(getObserveWsUrl('v1')).toBe('wss://prod.example.com/cht-v1?v2');
        });

        // Empty keeps the container from connecting at all.
        it('is empty when that stage is not configured', () => {
            vi.stubEnv('VITE_D1_WS_ENDPOINT', 'wss://dev.example.com/cht-d1');
            vi.stubEnv('VITE_V1_WS_ENDPOINT', '');

            expect(getObserveWsUrl('v1')).toBe('');
        });
    });

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
