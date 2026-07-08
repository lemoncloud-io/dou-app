import { create } from 'zustand';

interface LastChannelState {
    /** Last selected channel id per `cid:placeId` scope, to restore it when you return. */
    byScope: Record<string, string>;
    remember: (scope: string, channelId: string) => void;
}

/**
 * Remembers the channel you last had open in each cloud+place, so switching away and back
 * restores that channel instead of snapping to the first one. Keyed by `cid:placeId` because
 * place ids (sid) collide across clouds — a bare placeId would mix two clouds' selections.
 * In-memory (per session).
 */
export const useLastChannelStore = create<LastChannelState>(set => ({
    byScope: {},
    remember: (scope, channelId) =>
        set(state =>
            state.byScope[scope] === channelId ? state : { byScope: { ...state.byScope, [scope]: channelId } }
        ),
}));
