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
});
