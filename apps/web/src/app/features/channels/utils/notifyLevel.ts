export type NotifyLevel = 'all' | 'mention' | 'none';

const GROUP_LEVELS: readonly NotifyLevel[] = ['all', 'mention', 'none'];

const DM_LEVELS: readonly NotifyLevel[] = ['all', 'none'];

export const notifyLevelsFor = (isDm: boolean): readonly NotifyLevel[] => (isDm ? DM_LEVELS : GROUP_LEVELS);

export const notifyLevelOf = (notify: string | null | undefined, isDm: boolean): NotifyLevel => {
    if (notify === 'none') return 'none';
    if (notify === 'mention' && !isDm) return 'mention';
    return 'all';
};

export const NOTIFY_LEVEL_LABEL_KEY: Readonly<Record<NotifyLevel, string>> = {
    all: 'chat.settings.notifyMode.all',
    mention: 'chat.settings.notifyMode.mention',
    none: 'chat.settings.notifyMode.none',
};
