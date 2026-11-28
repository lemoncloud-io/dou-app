import * as fc from 'fast-check';

import { applyChannelOrder, moveChannel, normalizeChannelOrder } from './channelOrder';

jest.mock('@chatic/config', () => ({ config: { get: jest.fn(), set: jest.fn() } }));
jest.mock('@chatic/config/react', () => ({ useConfigValue: jest.fn() }));

const RUNS = { numRuns: 200, seed: 1123 };

const channelId = fc.constantFrom('c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8');
const channelIds = fc.uniqueArray(channelId, { maxLength: 8 });
const scope = fc.oneof(fc.constantFrom('cloud-a:place-1', 'cloud-a:place-2', 'cloud-b:place-1'), fc.string());

const storedValue = fc.oneof(
    fc.dictionary(scope, fc.oneof(fc.array(fc.oneof(channelId, fc.constant(''), fc.integer())), fc.anything())),
    fc.anything()
);

describe('channel order properties', () => {
    it('normalizing a stored order twice gives what normalizing it once gave', () => {
        fc.assert(
            fc.property(storedValue, raw => {
                const once = normalizeChannelOrder(raw);

                expect(normalizeChannelOrder(once)).toEqual(once);
                for (const ids of Object.values(once)) {
                    expect(ids.length).toBeGreaterThan(0);
                    expect(new Set(ids).size).toBe(ids.length);
                }
            }),
            RUNS
        );
    });

    it('applying a stored order to the channels on screen neither drops nor repeats one', () => {
        fc.assert(
            fc.property(channelIds, channelIds, (shown, stored) => {
                const ordered = applyChannelOrder(shown, stored);

                expect([...ordered].sort()).toEqual([...shown].sort());
                const storedFirst = stored.filter(id => shown.includes(id));
                if (storedFirst.length > 0) expect(ordered.slice(0, storedFirst.length)).toEqual(storedFirst);
            }),
            RUNS
        );
    });

    it('moving a channel keeps every other channel in its relative order and lands it at the clamped index', () => {
        fc.assert(
            fc.property(
                channelIds,
                channelIds,
                channelId,
                fc.integer({ min: -3, max: 12 }),
                (order, present, id, to) => {
                    const kept = order.filter(candidate => present.includes(candidate));
                    const moved = moveChannel(order, id, to, present);

                    expect([...moved].sort()).toEqual([...kept].sort());
                    expect(moved.filter(candidate => candidate !== id)).toEqual(
                        kept.filter(candidate => candidate !== id)
                    );
                    if (kept.includes(id)) expect(moved.indexOf(id)).toBe(Math.max(0, Math.min(kept.length - 1, to)));
                }
            ),
            RUNS
        );
    });
});
