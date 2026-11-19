import { useCallback, useEffect, useState } from 'react';

import { runtime, type DomainChat } from '@chatic/runtime';

/**
 * One message of a room by its number, for a screen opened on it: the cached row at once, then the
 * server's copy (fresh signed addresses, and a delete the cache has not heard of yet). A message the
 * server no longer has keeps the cached row with `hidden` set by its answer, or none at all.
 */
export const useChatMessage = (cid: string | undefined, channelId: string | undefined, chatNo: number) => {
    // The cached row is read from the graph the room reads (see `useRoomFiles`); the server's copy
    // through the room's own cloud.
    const { chat: roomChats } = runtime.data.useRuntimeRepositories();
    const [chat, setChat] = useState<DomainChat | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!cid || !channelId || !(chatNo > 0)) {
            setLoading(false);
            return;
        }
        const id = `${channelId}:${chatNo}`;
        const chats = runtime.data.getCloudRepositories(cid).chat;
        try {
            const cached = await roomChats.cacheRead(id);
            if (cached) setChat(cached);
        } catch {
            // Nothing cached is the same as nothing yet.
        }
        try {
            setChat(await chats.getChat({ id }));
        } catch {
            // Offline or gone: the cached row, if any, is what there is.
        } finally {
            setLoading(false);
        }
    }, [cid, channelId, chatNo, roomChats]);

    useEffect(() => {
        setChat(null);
        setLoading(true);
        void load();
    }, [load]);

    return { chat, loading, reload: load };
};
