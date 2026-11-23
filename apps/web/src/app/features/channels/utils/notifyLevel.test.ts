import { NOTIFY_LEVEL_LABEL_KEY, notifyLevelOf, notifyLevelsFor } from './notifyLevel';

describe('notifyLevelOf', () => {
    it.each([undefined, null, '', 'all'])('reads %p as all in a group', notify => {
        expect(notifyLevelOf(notify, false)).toBe('all');
    });

    it('reads mention as mention in a group', () => {
        expect(notifyLevelOf('mention', false)).toBe('mention');
    });

    it.each([false, true])('reads none as none whatever the room (dm: %p)', isDm => {
        expect(notifyLevelOf('none', isDm)).toBe('none');
    });

    it('reads mention as all in a 1:1', () => {
        expect(notifyLevelOf('mention', true)).toBe('all');
    });

    it.each([undefined, '', 'all'])('reads %p as all in a 1:1', notify => {
        expect(notifyLevelOf(notify, true)).toBe('all');
    });

    it('falls back to all for a value it does not know', () => {
        expect(notifyLevelOf('digest', false)).toBe('all');
    });
});

describe('notifyLevelsFor', () => {
    it('offers all three levels in a group, loudest first', () => {
        expect(notifyLevelsFor(false)).toEqual(['all', 'mention', 'none']);
    });

    it('drops Mentions only in a 1:1', () => {
        expect(notifyLevelsFor(true)).toEqual(['all', 'none']);
    });
});

describe('NOTIFY_LEVEL_LABEL_KEY', () => {
    it('names one chat.settings.notifyMode key per level', () => {
        expect(NOTIFY_LEVEL_LABEL_KEY).toEqual({
            all: 'chat.settings.notifyMode.all',
            mention: 'chat.settings.notifyMode.mention',
            none: 'chat.settings.notifyMode.none',
        });
    });
});
