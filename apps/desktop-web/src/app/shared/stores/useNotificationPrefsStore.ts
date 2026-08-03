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
     * Whether this device asked pushes-api to stop sending it push notifications.
     *
     * A different axis from everything above: those decide whether the *renderer*
     * raises a banner while the app is running, this one decides whether the server
     * sends the device anything at all. Muting here still leaves in-app notifications
     * working, and turning them off here still lets the server push.
     *
     * Local because there is no read endpoint — `device.update-remote` is a write whose
     * response echoes the authoritative value, so this mirror is seeded by our own
     * writes and reconciled to that echo. Default OFF, i.e. push allowed.
     */
    pushMuted: boolean;
    setDesktopEnabled: (enabled: boolean) => void;
    setPushMuted: (muted: boolean) => void;
    toggleMute: (channelId: string) => void;
    setChannelNotify: (channelId: string, mode: ChannelNotifyMode) => void;
    setSnooze: (untilMs: number | null) => void;
    setQuietHours: (quietHours: QuietHours | null) => void;
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
            snoozeUntil: null,
            quietHours: null,
            pushMuted: false,
            setDesktopEnabled: enabled => set({ desktopEnabled: enabled }),
            setPushMuted: muted => set({ pushMuted: muted }),
            setSnooze: untilMs => set({ snoozeUntil: untilMs }),
            setQuietHours: quietHours => set({ quietHours }),
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
