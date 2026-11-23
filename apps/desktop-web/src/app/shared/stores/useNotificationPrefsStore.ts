import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { deviceStore, persistStorageOver } from '../../storage';

export type ChannelNotifyMode = 'all' | 'mention' | 'none';

export interface QuietHours {
    start: string;
    end: string;
}

export interface PlaceNotifyPref {
    mode: ChannelNotifyMode;
    known: string[];
}

interface NotificationPrefsState {
    desktopEnabled: boolean;
    mutedChannels: Record<string, true>;
    channelNotify: Record<string, ChannelNotifyMode>;
    snoozeUntil: number | null;
    quietHours: QuietHours | null;
    mentionBreaksQuietHours: boolean;
    placeNotify: Record<string, PlaceNotifyPref>;
    setDesktopEnabled: (enabled: boolean) => void;
    setChannelNotify: (channelId: string, mode: ChannelNotifyMode) => void;
    setSnooze: (untilMs: number | null) => void;
    setQuietHours: (quietHours: QuietHours | null) => void;
    setMentionBreaksQuietHours: (enabled: boolean) => void;
    setPlaceNotify: (key: string, mode: ChannelNotifyMode, known: string[]) => void;
    addPlaceKnown: (key: string, channelIds: string[]) => void;
}

const GROUP_NOTIFY_MODES: readonly ChannelNotifyMode[] = ['all', 'mention', 'none'];
const DM_NOTIFY_MODES: readonly ChannelNotifyMode[] = ['all', 'none'];

export const isNotifyDm = (channel: { stereo?: string } | null | undefined): boolean => channel?.stereo === 'dm';

export const notifyModesFor = (isDm: boolean): readonly ChannelNotifyMode[] =>
    isDm ? DM_NOTIFY_MODES : GROUP_NOTIFY_MODES;

export type ChannelNotifyPrefs = Pick<NotificationPrefsState, 'channelNotify' | 'mutedChannels'>;

const storedNotifyMode = (
    state: ChannelNotifyPrefs,
    channelId: string,
    joinNotify?: ChannelNotifyMode | ''
): ChannelNotifyMode => {
    const local = state.channelNotify[channelId];
    if (local) return local;
    if (joinNotify === 'all' || joinNotify === 'mention' || joinNotify === 'none') return joinNotify;
    return state.mutedChannels[channelId] ? 'none' : 'all';
};

export const channelNotifyMode = (
    state: ChannelNotifyPrefs,
    channelId: string,
    joinNotify?: ChannelNotifyMode | '',
    isDm = false
): ChannelNotifyMode => {
    const stored = storedNotifyMode(state, channelId, joinNotify);
    return stored === 'mention' && isDm ? 'all' : stored;
};

export const useNotificationPrefsStore = create<NotificationPrefsState>()(
    persist(
        set => ({
            desktopEnabled: true,
            mutedChannels: {},
            channelNotify: {},
            snoozeUntil: null,
            quietHours: null,
            mentionBreaksQuietHours: false,
            placeNotify: {},
            setDesktopEnabled: enabled => set({ desktopEnabled: enabled }),
            setSnooze: untilMs => set({ snoozeUntil: untilMs }),
            setQuietHours: quietHours => set({ quietHours }),
            setMentionBreaksQuietHours: enabled => set({ mentionBreaksQuietHours: enabled }),
            setPlaceNotify: (key, mode, known) =>
                set(state => ({
                    placeNotify: {
                        ...state.placeNotify,
                        [key]: {
                            mode,
                            known:
                                state.placeNotify[key]?.mode === mode
                                    ? [...new Set([...state.placeNotify[key].known, ...known])]
                                    : [...new Set(known)],
                        },
                    },
                })),
            addPlaceKnown: (key, channelIds) =>
                set(state => {
                    const pref = state.placeNotify[key];
                    if (!pref) return {};
                    return {
                        placeNotify: {
                            ...state.placeNotify,
                            [key]: { ...pref, known: [...new Set([...pref.known, ...channelIds])] },
                        },
                    };
                }),
            setChannelNotify: (channelId, mode) =>
                set(state => {
                    const muted = { ...state.mutedChannels };
                    if (mode === 'none') muted[channelId] = true;
                    else delete muted[channelId];
                    return {
                        channelNotify: { ...state.channelNotify, [channelId]: mode },
                        mutedChannels: muted,
                    };
                }),
        }),
        { name: 'chatic-notification-prefs', storage: persistStorageOver(deviceStore) }
    )
);
