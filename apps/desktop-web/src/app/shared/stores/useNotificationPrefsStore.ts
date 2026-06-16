import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Per-channel notification mode (mirrors the server's JoinNotify values). */
export type ChannelNotifyMode = 'all' | 'mention' | 'none';

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
    setDesktopEnabled: (enabled: boolean) => void;
    toggleMute: (channelId: string) => void;
    setChannelNotify: (channelId: string, mode: ChannelNotifyMode) => void;
}

/** Resolve a channel's effective notify mode from the persisted prefs. */
export const channelNotifyMode = (
    state: Pick<NotificationPrefsState, 'channelNotify' | 'mutedChannels'>,
    channelId: string
): ChannelNotifyMode => state.channelNotify[channelId] ?? (state.mutedChannels[channelId] ? 'none' : 'all');

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
            setDesktopEnabled: enabled => set({ desktopEnabled: enabled }),
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
