import { describe, expect, it } from 'vitest';

import { landingTarget } from './landingTarget';

const rows = (...ids: string[]) => ids.map(id => ({ id }));

describe('landingTarget', () => {
    it('lands on a pending channel once the list carries it', () => {
        expect(landingTarget(rows('C1', 'dm-new'), { pendingChannelId: 'dm-new', selectedChannelId: 'C1' })).toEqual({
            kind: 'pending',
            channelId: 'dm-new',
        });
    });

    it('keeps the current selection while a pending channel is not listed yet', () => {
        // A 1:1 that was just started: no snap to the remembered or first channel while it syncs.
        expect(
            landingTarget(rows('C1', 'C2'), {
                pendingChannelId: 'dm-new',
                selectedChannelId: 'C2',
                rememberedChannelId: 'C1',
            })
        ).toBeNull();
    });

    it('restores the remembered channel when the selection left the list', () => {
        expect(
            landingTarget(rows('C1', 'C2'), {
                pendingChannelId: null,
                selectedChannelId: 'gone',
                rememberedChannelId: 'C2',
            })
        ).toEqual({ kind: 'fallback', channelId: 'C2' });
    });

    it('falls back to the first unread channel, then the first one', () => {
        const channels = [{ id: 'C1' }, { id: 'C2', unreadCount: 3 }];
        expect(landingTarget(channels, { pendingChannelId: null, selectedChannelId: null })).toEqual({
            kind: 'fallback',
            channelId: 'C2',
        });
        expect(
            landingTarget(rows('C1'), { pendingChannelId: null, selectedChannelId: null, rememberedChannelId: 'gone' })
        ).toEqual({ kind: 'fallback', channelId: 'C1' });
    });

    it('selects nothing from an empty list', () => {
        expect(landingTarget([], { pendingChannelId: 'dm-new', selectedChannelId: null })).toBeNull();
    });

    // The Self Channel is listed in the place being left as well, so "listed" alone would land the
    // open there, before the place switch it is waiting for has finished.
    describe('while the place switch it waits for is unfinished', () => {
        it('lands nothing, even though the pending channel is listed', () => {
            expect(
                landingTarget(rows('C1', 'self'), {
                    pendingChannelId: 'self',
                    selectedChannelId: 'C1',
                    placeSettled: false,
                })
            ).toBeNull();
        });

        it('lands it once the place has settled', () => {
            expect(
                landingTarget(rows('C1', 'self'), {
                    pendingChannelId: 'self',
                    selectedChannelId: 'C1',
                    placeSettled: true,
                })
            ).toEqual({ kind: 'pending', channelId: 'self' });
        });

        // The fallback waits with the open: mid-switch the list is the target place's cached one, and
        // a fallback landing there would open and mark read a channel nobody picked. A switch that
        // fails does not leave this hold behind — HomePage drops the wait (`abandonPending`), after
        // which the selection is judged as usual.
        it('holds the fallback too when the selection left the list', () => {
            expect(
                landingTarget(rows('C1', 'self'), {
                    pendingChannelId: 'self',
                    selectedChannelId: 'gone',
                    placeSettled: false,
                })
            ).toBeNull();
        });

        it('falls back once the wait is dropped, as after a switch that failed', () => {
            expect(landingTarget(rows('C1', 'self'), { pendingChannelId: null, selectedChannelId: 'gone' })).toEqual({
                kind: 'fallback',
                channelId: 'C1',
            });
        });

        it('does not hold a selection that left the list when nothing is pending', () => {
            expect(
                landingTarget(rows('C1'), { pendingChannelId: null, selectedChannelId: 'gone', placeSettled: false })
            ).toEqual({ kind: 'fallback', channelId: 'C1' });
        });
    });
});
