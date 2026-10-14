import { describe, expect, it, vi } from 'vitest';

import {
    channelNotifyMode,
    notifyModesFor,
    useNotificationPrefsStore,
} from './useNotificationPrefsStore';

// The join.notify fallback is the seam the settings panel, the row menu and
// both notifiers share — a regression here flips server-side 'mention'
// channels back to 'all' everywhere at once.
describe('channelNotifyMode', () => {
    const state = (channelNotify: Record<string, 'all' | 'mention' | 'none'>, muted: string[] = []) => ({
        channelNotify,
        mutedChannels: Object.fromEntries(muted.map(id => [id, true])),
    });

    it('local pref wins over everything', () => {
        expect(channelNotifyMode(state({ C1: 'none' }), 'C1', 'all')).toBe('none');
    });

    it('falls back to the server join.notify when no local pref exists', () => {
        expect(channelNotifyMode(state({}), 'C1', 'mention')).toBe('mention');
    });

    it('ignores a join.notify value outside the mode set', () => {
        expect(channelNotifyMode(state({}), 'C1', '' as never)).toBe('all');
    });

    it('mute map applies only when neither local pref nor join.notify exists', () => {
        expect(channelNotifyMode(state({}, ['C1']), 'C1')).toBe('none');
        expect(channelNotifyMode(state({}, ['C1']), 'C1', 'mention')).toBe('mention');
    });

    // The server sends a 1:1 set to mentions only everything (it filters group channels alone), so
    // showing it as mentions only would name a level that does not exist there.
    describe('in a 1:1', () => {
        it('reads a server value of mentions only as all', () => {
            expect(channelNotifyMode(state({}), 'C1', 'mention', true)).toBe('all');
        });

        it('reads a local pref of mentions only as all', () => {
            expect(channelNotifyMode(state({ C1: 'mention' }), 'C1', undefined, true)).toBe('all');
        });

        it('still reads off as off', () => {
            expect(channelNotifyMode(state({}), 'C1', 'none', true)).toBe('none');
            expect(channelNotifyMode(state({ C1: 'none' }), 'C1', 'mention', true)).toBe('none');
        });
    });
});

describe('notifyModesFor', () => {
    it('offers all three levels in a group channel', () => {
        expect(notifyModesFor(false)).toEqual(['all', 'mention', 'none']);
    });

    it('does not offer mentions only in a 1:1', () => {
        expect(notifyModesFor(true)).toEqual(['all', 'none']);
    });
});

describe('mentionBreaksQuietHours', () => {
    it('is off by default, so an update adds no new banners', () => {
        expect(useNotificationPrefsStore.getState().mentionBreaksQuietHours).toBe(false);
    });

    it('is stored by its setter', () => {
        useNotificationPrefsStore.getState().setMentionBreaksQuietHours(true);
        expect(useNotificationPrefsStore.getState().mentionBreaksQuietHours).toBe(true);
        useNotificationPrefsStore.getState().setMentionBreaksQuietHours(false);
        expect(useNotificationPrefsStore.getState().mentionBreaksQuietHours).toBe(false);
    });

    // A state saved before the toggle existed carries no such key; the
    // persist merge must leave the default (off) in place.
    it('reads a stored state from before the toggle as off', async () => {
        localStorage.setItem(
            'chatic-notification-prefs',
            JSON.stringify({
                state: { desktopEnabled: true, mutedChannels: {}, channelNotify: {}, snoozeUntil: null, quietHours: null },
                version: 0,
            })
        );
        vi.resetModules();
        try {
            const fresh = await import('./useNotificationPrefsStore');
            await fresh.useNotificationPrefsStore.persist.rehydrate();
            expect(fresh.useNotificationPrefsStore.getState().mentionBreaksQuietHours).toBe(false);
        } finally {
            localStorage.removeItem('chatic-notification-prefs');
            vi.resetModules();
        }
    });
});
