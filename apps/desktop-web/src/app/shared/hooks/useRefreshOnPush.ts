import { useEffect, useRef } from 'react';

import { webClient } from '@chatic/bridges';
import { getSocketManager, useRuntimeRepositories } from '@chatic/app-runtime';

/**
 * Refresh the active cloud's channel records when new activity arrives, so the unread badges
 * (place rail + channel rows) update at message time instead of up to a minute later.
 *
 * Badges are derived from cached channel records (`lastChat$` / `chatNo` vs the read cursor). The
 * v2 backend never streams channel-record updates for background channels: `registerChannel` polls
 * `channel.get` (not implemented here), and the chat sync plan only applies the focused room — so a
 * message in another place does NOT advance that channel's record, and the badge stays stale until
 * the 60s background poll. Two activity signals are wired here, since one alone misses cases:
 *
 *  - the shell-forwarded FCM push (`OnReceiveNotification`) — covers cross-cloud and any push the
 *    backend also fans out for the active cloud; and
 *  - the raw socket chat broadcast — the active cloud's socket covers all of its places, so even
 *    though the sync plan ignores a background channel's chat frame, the frame still reaches
 *    `onMessage`; it's the reliable "something in this cloud got a message" signal.
 *
 * On either, re-pull `channel.mine` so the affected record advances and the badge recomputes.
 * Debounced so a burst is one fetch. Note the reach: `channel.mine` answers for the site the socket
 * session is on, so this refreshes the ACTIVE place only — a background place's badge still waits
 * for the cloud-wide `channel.sync` in useBackgroundSync.
 */
export const useRefreshOnPush = (): void => {
    const { channel } = useRuntimeRepositories();
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const schedule = () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                void channel.refreshList({}).catch(() => undefined);
            }, 300);
        };

        const offPush = webClient.onEvent('OnReceiveNotification', schedule);

        // onMessage needs a live client (and isn't rebind-safe), so bind it through subscribeClient.
        const manager = getSocketManager();
        let offMessage: (() => void) | undefined;
        const offClient = manager.subscribeClient(client => {
            offMessage?.();
            offMessage = undefined;
            if (!client) return;
            offMessage = manager.onMessage(({ message }) => {
                const type = (message as { type?: string })?.type ?? '';
                if (type.startsWith('chat')) schedule();
            });
        });

        return () => {
            offPush();
            offMessage?.();
            offClient();
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [channel]);
};
