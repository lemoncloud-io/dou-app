import { useEffect, useRef } from 'react';

import { runtime } from '@chatic/runtime-react';

import { parsePushDeeplink } from '../utils/parsePushDeeplink';

export const chatFrameChannelIdOf = (message: unknown): string => {
    const data = (message as { data?: { channelId?: unknown } } | null | undefined)?.data;
    return typeof data?.channelId === 'string' ? data.channelId : '';
};

const MAX_TARGETED_PER_FIRE = 10;

export const useRefreshOnPush = (): void => {
    const { channel } = runtime.data.useRuntimeRepositories();
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sidRef = useRef(selectedSiteId);
    sidRef.current = selectedSiteId;
    const pendingRef = useRef<Map<string, string | undefined>>(new Map());
    const fallbackRef = useRef(false);

    useEffect(() => {
        const fire = () => {
            const sid = sidRef.current ?? '';
            const ids = [...pendingRef.current.entries()];
            pendingRef.current.clear();
            const fallback = fallbackRef.current;
            fallbackRef.current = false;
            if (fallback || ids.length === 0 || ids.length > MAX_TARGETED_PER_FIRE) {
                void channel.refreshList({ sid }).catch(() => undefined);
                return;
            }
            void Promise.allSettled(
                ids.map(([id, placeId]) =>
                    placeId ? channel.refreshOne(id, placeId) : channel.refreshOneInCloud(id, sid)
                )
            ).then(() => undefined);
        };
        const schedule = (channelId?: string, placeId?: string) => {
            if (channelId) pendingRef.current.set(channelId, placeId);
            else fallbackRef.current = true;
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(fire, 300);
        };

        const offPush = runtime.push.notifications?.onReceive(payload => {
            const deeplink = (payload.notification as { data?: { deeplink?: string } } | undefined)?.data?.deeplink;
            const target = parsePushDeeplink(deeplink);
            if (!target) {
                schedule();
                return;
            }
            if (target.cloudId) return;
            schedule(target.channelId, target.placeId || undefined);
        });

        const offMessage = runtime.connection.onServerMessage(message => {
            const type = (message as { type?: string })?.type ?? '';
            if (!type.startsWith('chat')) return;
            schedule(chatFrameChannelIdOf(message) || undefined);
        });

        return () => {
            offPush?.();
            offMessage();
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [channel]);
};
