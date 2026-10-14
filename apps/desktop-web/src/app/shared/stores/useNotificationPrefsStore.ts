import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Per-channel notification mode (mirrors the server's JoinNotify values). */
export type ChannelNotifyMode = 'all' | 'mention' | 'none';

/** A recurring local "quiet" window, as "HH:MM" 24h strings (may cross midnight). */
export interface QuietHours {
    start: string;
    end: string;
}

interface NotificationPrefsState {
    /** Global switch for OS notifications (desktop shell only). */
    desktopEnabled: boolean;
    /** channelId → muted. Muted channels never raise an OS notification. */
    mutedChannels: Record<string, true>;
    /**
     * channelId → notify mode. Local-first mirror of the server's join.notify
     * (the server copy keeps other clients in sync; this one answers instantly
     * at notification time). Missing entry falls back to mutedChannels, then 'all'.
     */
    channelNotify: Record<string, ChannelNotifyMode>;
    /** Snooze-until epoch ms; null = not snoozed. Mutes banners + toasts globally. */
    snoozeUntil: number | null;
    /** Recurring quiet window; null = off. Mutes banners + toasts while inside it. */
    quietHours: QuietHours | null;
    /**
     * Let a mention that names me break quiet hours (not snooze). Off unless
     * turned on: existing quiet-hours users get no new banners on update.
     */
    mentionBreaksQuietHours: boolean;
    setDesktopEnabled: (enabled: boolean) => void;
    toggleMute: (channelId: string) => void;
    setChannelNotify: (channelId: string, mode: ChannelNotifyMode) => void;
    setSnooze: (untilMs: number | null) => void;
    setQuietHours: (quietHours: QuietHours | null) => void;
    setMentionBreaksQuietHours: (enabled: boolean) => void;
}

const GROUP_NOTIFY_MODES: readonly ChannelNotifyMode[] = ['all', 'mention', 'none'];
const DM_NOTIFY_MODES: readonly ChannelNotifyMode[] = ['all', 'none'];

/**
 * Whether the server treats this channel as a 1:1 when it decides who a message is pushed to:
 * `stereo: 'dm'` and nothing else. A two-person channel with no name is drawn as a 1:1 here, but
 * to the server it is a group channel and "mentions only" works in it.
 */
export const isNotifyDm = (channel: { stereo?: string } | null | undefined): boolean => channel?.stereo === 'dm';

/** The levels a channel offers, in display order. A 1:1 has no "mentions only" (see `channelNotifyMode`). */
export const notifyModesFor = (isDm: boolean): readonly ChannelNotifyMode[] =>
    isDm ? DM_NOTIFY_MODES : GROUP_NOTIFY_MODES;

/** The slice of the preferences that decides a channel's notify mode. */
export type ChannelNotifyPrefs = Pick<NotificationPrefsState, 'channelNotify' | 'mutedChannels'>;

/** The mode as stored: local pref, then the server's join.notify, then the legacy mute map. */
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

/**
 * Resolve a channel's effective notify mode: local pref, then the server's
 * join.notify (set from another device), then the legacy mute map. Every read
 * site (panel, row menu, notifiers) calls this so the radio and the actual
 * suppression cannot drift.
 *
 * In a 1:1 (`isNotifyDm`) "mentions only" reads as all: the server sends such a member every
 * message of a 1:1, so the level does not exist there. The stored value is left alone.
 */
export const channelNotifyMode = (
    state: ChannelNotifyPrefs,
    channelId: string,
    joinNotify?: ChannelNotifyMode | '',
    isDm = false
): ChannelNotifyMode => {
    const stored = storedNotifyMode(state, channelId, joinNotify);
    return stored === 'mention' && isDm ? 'all' : stored;
};

/**
 * User notification preferences, persisted to localStorage so they survive
 * reloads. Consumed by useDesktopNotifications (global enable + per-channel
 * mode); the settings page and channel panel write to it.
 */
export const useNotificationPrefsStore = create<NotificationPrefsState>()(
    persist(
        set => ({
            desktopEnabled: true,
            mutedChannels: {},
            channelNotify: {},
            snoozeUntil: null,
            quietHours: null,
            mentionBreaksQuietHours: false,
            setDesktopEnabled: enabled => set({ desktopEnabled: enabled }),
            setSnooze: untilMs => set({ snoozeUntil: untilMs }),
            setQuietHours: quietHours => set({ quietHours }),
            setMentionBreaksQuietHours: enabled => set({ mentionBreaksQuietHours: enabled }),
            toggleMute: channelId =>
                set(state => {
                    const next = { ...state.mutedChannels };
                    if (next[channelId]) delete next[channelId];
                    else next[channelId] = true;
                    return { mutedChannels: next };
                }),
            setChannelNotify: (channelId, mode) =>
                set(state => {
                    // Keep the legacy mute map coherent for anything still reading it.
                    const muted = { ...state.mutedChannels };
                    if (mode === 'none') muted[channelId] = true;
                    else delete muted[channelId];
                    return {
                        channelNotify: { ...state.channelNotify, [channelId]: mode },
                        mutedChannels: muted,
                    };
                }),
        }),
        { name: 'chatic-notification-prefs' }
    )
);
