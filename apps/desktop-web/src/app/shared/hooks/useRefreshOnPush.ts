import { useEffect, useRef } from 'react';

import { webClient } from '@chatic/bridges';
import { runtime } from '@chatic/app-runtime';

import { parsePushDeeplink } from '../utils/parsePushDeeplink';

/**
 * A socket chat frame's channel, when it carries one. `chat.sync` frames carry the message as
 * `data` with its `channelId` (server chat-sync-plan); anything else shapes to '' and the caller
 * falls back to the whole-list refresh.
 */
export const chatFrameChannelIdOf = (message: unknown): string => {
    const data = (message as { data?: { channelId?: unknown } } | null | undefined)?.data;
    return typeof data?.channelId === 'string' ? data.channelId : '';
};

/** Targeted single-channel refreshes per debounced fire; beyond that the list pull is cheaper. */
const MAX_TARGETED_PER_FIRE = 10;

/**
 * Refresh the active cloud's channel records when new activity arrives, so the unread badges
 * (place rail + channel rows) update at message time instead of up to a minute later.
 *
 * Badges are derived from cached channel records (`lastChat$` / `chatNo` vs the read cursor). The
 * v2 backend never streams channel-record updates for background channels, and the chat sync plan
 * only applies the focused room — so a message in another place does NOT advance that channel's
 * record, and the badge stays stale until the 60s background poll. Two activity signals are wired
 * here, since one alone misses cases:
 *
 *  - the shell-forwarded FCM push (`OnReceiveNotification`) — covers cross-cloud and any push the
 *    backend also fans out for the active cloud; and
 *  - the raw socket chat broadcast — the active cloud's socket covers all of its places, so even
 *    though the sync plan ignores a background channel's chat frame, the frame still reaches
 *    `onMessage`; it's the reliable "something in this cloud got a message" signal.
 *
 * A signal that names its channel refreshes just that row (`channel.get`); anything unattributed
 * falls back to re-pulling `channel.mine`. Debounced so a burst is one fire. Note the reach: both
 * refreshes answer for the site the socket session is on, so this covers the ACTIVE place only — a
 * background place's badge still waits for the cloud-wide `channel.sync` in useBackgroundSync, and
 * a cross-cloud push names another cloud, so it is skipped here (that cloud's BackgroundReceiver
 * loop owns it).
 */
export const useRefreshOnPush = (): void => {
    const { channel } = runtime.data.useRuntimeRepositories();
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Through a ref, not a dep: the site is needed when the debounce FIRES, and putting it in the
    // effect deps would tear down and rebind the push/message listeners on every site switch.
    // `channel.mine` answers for whichever site the socket session is on — naming the site we
    // believe that is what tags the rows and gates the prune inside refreshList (ADR-0085).
    const sidRef = useRef(selectedSiteId);
    sidRef.current = selectedSiteId;
    // Channels named since the last fire, and whether anything unattributed arrived. Refs for the
    // same reason as sidRef: the listeners must stay bound while the pending set accumulates.
    const pendingRef = useRef<Set<string>>(new Set());
    const fallbackRef = useRef(false);

    useEffect(() => {
        const fire = () => {
            const sid = sidRef.current ?? '';
            const ids = [...pendingRef.current].slice(0, MAX_TARGETED_PER_FIRE);
            pendingRef.current.clear();
            const fallback = fallbackRef.current;
            fallbackRef.current = false;
            if (fallback || ids.length === 0) {
                void channel.refreshList({ sid }).catch(() => undefined);
                return;
            }
            // One row each: a burst across rooms is N small `channel.get` pulls instead of one
            // full `channel.mine` list. allSettled — a gone channel must not cancel the rest.
            void Promise.allSettled(ids.map(id => channel.refreshOne(id, sid))).then(() => undefined);
        };
        const schedule = (channelId?: string) => {
            if (channelId) pendingRef.current.add(channelId);
            else fallbackRef.current = true;
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(fire, 300);
        };

        const offPush = webClient.onEvent('OnReceiveNotification', message => {
            const deeplink = (message?.data as { notification?: { data?: { deeplink?: string } } })?.notification?.data
                ?.deeplink;
            const target = parsePushDeeplink(deeplink);
            // Unparseable links name no channel, but the push itself still says something
            // arrived — fall back to the whole-list refresh rather than ignore the signal.
            // (Menu-bar `chatic-ui:` actions reach the router's own listener, not this one.)
            if (!target) {
                schedule();
                return;
            }
            // Cross-cloud pushes name another cloud's channel: `channel.get` would ask the active
            // cloud's session about a foreign id, so they are skipped — that cloud's background
            // receive loop owns them.
            if (target.cloudId) return;
            schedule(target.channelId);
        });

        // onMessage needs a live client (and isn't rebind-safe), so bind it through subscribeClient.
        const manager = runtime.connection.getSocketManager();
        let offMessage: (() => void) | undefined;
        const offClient = manager.subscribeClient(client => {
            offMessage?.();
            offMessage = undefined;
            if (!client) return;
            offMessage = manager.onMessage(({ message }) => {
                const type = (message as { type?: string })?.type ?? '';
                if (!type.startsWith('chat')) return;
                schedule(chatFrameChannelIdOf(message) || undefined);
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
