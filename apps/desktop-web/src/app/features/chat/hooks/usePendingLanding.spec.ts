import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

import { landingTarget, pendingOpenRoute } from '../utils';
import { PENDING_LANDING_TTL_MS, usePendingLanding } from './usePendingLanding';

describe('usePendingLanding', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    const armAll = (landing: ReturnType<typeof usePendingLanding>) => {
        landing.pendingChannelRef.current = 'C1';
        landing.pendingPlaceRef.current = 'P1';
        landing.pendingJumpRef.current = { channelId: 'C1', chatNo: 7 };
        landing.pendingOpenAtBottomRef.current = 'C1';
        landing.pendingThreadRef.current = { channelId: 'C1', rootId: 'R1' };
        landing.armPendingExpiry();
    };

    it('drops every pending landing when the expiry fires', () => {
        const { result } = renderHook(() => usePendingLanding());
        armAll(result.current);

        act(() => {
            vi.advanceTimersByTime(PENDING_LANDING_TTL_MS);
        });

        expect(result.current.pendingChannelRef.current).toBeNull();
        expect(result.current.pendingPlaceRef.current).toBeNull();
        expect(result.current.pendingJumpRef.current).toBeNull();
        expect(result.current.pendingOpenAtBottomRef.current).toBeNull();
        expect(result.current.pendingThreadRef.current).toBeNull();
    });

    it('stops waiting for a place when the expiry fires', () => {
        const { result } = renderHook(() => usePendingLanding());
        armAll(result.current);
        result.current.awaitedPlaceRef.current = 'P2';

        act(() => {
            vi.advanceTimersByTime(PENDING_LANDING_TTL_MS);
        });

        expect(result.current.awaitedPlaceRef.current).toBeNull();
    });

    it('drops the place an earlier open waited for when a new one is armed', () => {
        const { result } = renderHook(() => usePendingLanding());
        armAll(result.current);
        result.current.awaitedPlaceRef.current = 'P2';

        result.current.armPendingExpiry();

        expect(result.current.awaitedPlaceRef.current).toBeNull();
    });

    it('abandons every pending landing and the awaited place at once', () => {
        const { result } = renderHook(() => usePendingLanding());
        armAll(result.current);
        result.current.awaitedPlaceRef.current = 'P2';

        act(() => {
            result.current.abandonPending();
        });

        expect(result.current.pendingChannelRef.current).toBeNull();
        expect(result.current.pendingPlaceRef.current).toBeNull();
        expect(result.current.awaitedPlaceRef.current).toBeNull();
        expect(result.current.pendingJumpRef.current).toBeNull();
        expect(result.current.pendingOpenAtBottomRef.current).toBeNull();
        expect(result.current.pendingThreadRef.current).toBeNull();
    });

    it('restarts the expiry when re-armed', () => {
        const { result } = renderHook(() => usePendingLanding());
        armAll(result.current);
        act(() => {
            vi.advanceTimersByTime(PENDING_LANDING_TTL_MS - 1_000);
        });
        result.current.armPendingExpiry();
        act(() => {
            vi.advanceTimersByTime(PENDING_LANDING_TTL_MS - 1_000);
        });

        expect(result.current.pendingChannelRef.current).toBe('C1');
    });

    it('cancels the expiry on unmount', () => {
        const { result, unmount } = renderHook(() => usePendingLanding());
        armAll(result.current);
        unmount();

        expect(vi.getTimerCount()).toBe(0);
    });

    it('keeps armPendingExpiry stable across renders', () => {
        const { result, rerender } = renderHook(() => usePendingLanding());
        const first = result.current.armPendingExpiry;
        rerender();

        expect(result.current.armPendingExpiry).toBe(first);
    });
});

// The path a newly started 1:1 takes through the home screen: the open target names no place, the
// room is not listed yet, so the screen waits, keeps the open channel, and lands once the row arrives.
describe('landing a 1:1 that was just started', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    const here = { cloudId: 'cloud-1', placeId: 'P1' };
    const listed = ['C1', 'C2'];

    const start = () => {
        const { result } = renderHook(() => usePendingLanding());
        const route = pendingOpenRoute({ placeId: '', channelId: 'dm-new' }, { ...here, listedIds: new Set(listed) });
        expect(route).toBe('wait');
        result.current.pendingChannelRef.current = 'dm-new';
        result.current.armPendingExpiry();
        return result.current;
    };

    it('stays on the open channel until the row arrives, then lands on it', () => {
        const landing = start();
        const land = (ids: string[]) =>
            landingTarget(
                ids.map(id => ({ id })),
                {
                    pendingChannelId: landing.pendingChannelRef.current,
                    selectedChannelId: 'C2',
                    rememberedChannelId: 'C1',
                }
            );

        expect(land(listed)).toBeNull();
        act(() => {
            vi.advanceTimersByTime(PENDING_LANDING_TTL_MS - 1_000);
        });
        expect(land([...listed, 'dm-new'])).toEqual({ kind: 'pending', channelId: 'dm-new' });
    });

    it('gives up once the landing expires, and leaves the open channel alone', () => {
        const landing = start();
        act(() => {
            vi.advanceTimersByTime(PENDING_LANDING_TTL_MS);
        });

        expect(
            landingTarget(
                [...listed, 'dm-new'].map(id => ({ id })),
                { pendingChannelId: landing.pendingChannelRef.current, selectedChannelId: 'C2' }
            )
        ).toBeNull();
    });
});
