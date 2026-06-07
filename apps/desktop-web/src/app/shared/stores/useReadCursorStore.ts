import { create } from 'zustand';

interface ReadCursorState {
    /** channelId → highest chatNo this client has marked read (monotonic). */
    cursors: Record<string, number>;
    markRead: (channelId: string, chatNo: number) => void;
}

/**
 * Client-side read cursor. The server's `$join.chatNo` is eventually consistent
 * and lags a read-receipt round-trip, so right after you read a channel a
 * refetch can briefly compute unread > 0 (badge flashes, then clears on
 * join:update). We record what we've read locally and clamp unread against it,
 * so the badge never reappears for a message we already saw. Session-scoped —
 * on reload the server cursor has caught up and is authoritative.
 */
export const useReadCursorStore = create<ReadCursorState>((set, get) => ({
    cursors: {},
    markRead: (channelId, chatNo) => {
        if (!channelId || !chatNo) return;
        if (chatNo <= (get().cursors[channelId] ?? 0)) return;
        set(state => ({ cursors: { ...state.cursors, [channelId]: chatNo } }));
    },
}));
