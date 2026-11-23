import { create } from 'zustand';

interface ChannelSettingsState {
    openChannelId: string | null;
    focus: 'members' | null;
    open: (channelId: string, focus?: 'members') => void;
    close: () => void;
    closeIfOpenFor: (channelId: string | null) => void;
}

export const useChannelSettingsStore = create<ChannelSettingsState>(set => ({
    openChannelId: null,
    focus: null,
    open: (channelId, focus) => set({ openChannelId: channelId, focus: focus ?? null }),
    close: () => set({ openChannelId: null, focus: null }),
    closeIfOpenFor: channelId =>
        set(s => (channelId && s.openChannelId === channelId ? { openChannelId: null, focus: null } : s)),
}));
