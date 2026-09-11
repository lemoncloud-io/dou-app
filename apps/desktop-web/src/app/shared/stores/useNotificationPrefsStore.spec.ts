import { describe, expect, it } from 'vitest';

import { channelNotifyMode } from './useNotificationPrefsStore';

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
});
