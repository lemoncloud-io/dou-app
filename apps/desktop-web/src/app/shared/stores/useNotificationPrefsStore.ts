import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface NotificationPrefsState {
    /** Global switch for OS notifications (desktop shell only). */
    desktopEnabled: boolean;
    /** channelId → muted. Muted channels never raise an OS notification. */
    mutedChannels: Record<string, true>;
    setDesktopEnabled: (enabled: boolean) => void;
    toggleMute: (channelId: string) => void;
    isMuted: (channelId: string) => boolean;
}

/**
 * User notification preferences, persisted to localStorage so they survive
 * reloads. Consumed by useDesktopNotifications (global enable + per-channel
 * mute); the settings page and channel panel write to it.
 */
export const useNotificationPrefsStore = create<NotificationPrefsState>()(
    persist(
        (set, get) => ({
            desktopEnabled: true,
            mutedChannels: {},
            setDesktopEnabled: enabled => set({ desktopEnabled: enabled }),
            toggleMute: channelId =>
                set(state => {
                    const next = { ...state.mutedChannels };
                    if (next[channelId]) delete next[channelId];
                    else next[channelId] = true;
                    return { mutedChannels: next };
                }),
            isMuted: channelId => !!get().mutedChannels[channelId],
        }),
        { name: 'chatic-notification-prefs' }
    )
);
