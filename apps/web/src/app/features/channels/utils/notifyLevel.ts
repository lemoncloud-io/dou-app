/**
 * A room's notification level as this client offers it: the server's `notify` on my join row
 * (`'' | 'all' | 'mention' | 'none'`) without the `''` spelling, which the server reads as `all`.
 */
export type NotifyLevel = 'all' | 'mention' | 'none';

const GROUP_LEVELS: readonly NotifyLevel[] = ['all', 'mention', 'none'];

// A 1:1 has no "Mentions only": the server treats `mention` there as `all`, so offering it would
// let the user pick a level that behaves exactly like another one.
const DM_LEVELS: readonly NotifyLevel[] = ['all', 'none'];

/** The levels a room offers, in display order. */
export const notifyLevelsFor = (isDm: boolean): readonly NotifyLevel[] => (isDm ? DM_LEVELS : GROUP_LEVELS);

/**
 * The level a stored `notify` value means for this room.
 *
 * Anything unrecognised — missing, `''`, a value a newer server adds — reads as `all`, the server's
 * own default, rather than as muted: showing a room as silent when it is not would hide messages the
 * user is still being sent.
 *
 * A 1:1 stored as `mention` reads as `all` because that is how the server delivers it. The stored
 * value is left alone — this only decides what the screen shows.
 */
export const notifyLevelOf = (notify: string | null | undefined, isDm: boolean): NotifyLevel => {
    if (notify === 'none') return 'none';
    if (notify === 'mention' && !isDm) return 'mention';
    return 'all';
};

/** Translation key for a level's label — spelled out so a search for the key finds its user. */
export const NOTIFY_LEVEL_LABEL_KEY: Readonly<Record<NotifyLevel, string>> = {
    all: 'chat.settings.notifyMode.all',
    mention: 'chat.settings.notifyMode.mention',
    none: 'chat.settings.notifyMode.none',
};
