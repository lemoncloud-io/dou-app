import { useCallback, useEffect, useMemo, useRef } from 'react';

import { runtime } from '@chatic/runtime';
import { logger } from '@chatic/bridges';
import { useCloudSessionCatalog } from '../../hooks/useCloudCatalog';
import type { AppMessageData } from '@chatic/bridge-messages';

import { appBridge } from '../../bridge/appBridge';
import { useOnBackgroundStatusChanged, useOnReceiveNotification } from '../../bridge/useHandleAppMessage';
import { extractPushCloudHint } from '../../utils/resolveInAppPushRoute';
import { useInvitedClouds } from '../../hooks';
import { useJoinedCloudIds } from '../../hooks/useJoinedCloudIds';
import { useCloudPushMarkStore } from './stores/useCloudPushMarkStore';
import { isChatPush } from './utils/isChatPush';
import { RELAY_CLOUD_ID, resolvePushCloudId } from './utils/resolvePushCloudId';

const MARK_CLEAR_GRACE_MS = 1_000;

export const CloudPushMarkRunner = (): null => {
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const { clouds: ownedClouds } = useCloudSessionCatalog();
    const { invitedClouds } = useInvitedClouds();
    const { resolveContext } = runtime.data.useGlobalCacheSearch();

    const markInStore = useCloudPushMarkStore(s => s.mark);
    const clear = useCloudPushMarkStore(s => s.clear);
    const activeBadged = useCloudPushMarkStore(s => (selectedCloudId ? !!s.badged[selectedCloudId] : false));

    const markedAtRef = useRef(new Map<string, number>());
    const mountedAtRef = useRef(Date.now());

    const mark = useCallback(
        (cloudId: string) => {
            markedAtRef.current.set(cloudId, Date.now());
            markInStore(cloudId);
            runtime.sync.refreshBackgroundClouds(cloudId);
        },
        [markInStore]
    );

    useEffect(() => {
        const timers = new Set<ReturnType<typeof setTimeout>>();
        const unsubscribe = runtime.sync.subscribeBackgroundDeltas(({ cid, requestedAt }) => {
            if (requestedAt < (markedAtRef.current.get(cid) ?? mountedAtRef.current)) return;
            const timer = setTimeout(() => {
                timers.delete(timer);
                if (requestedAt < (markedAtRef.current.get(cid) ?? mountedAtRef.current)) return;
                markedAtRef.current.delete(cid);
                clear(cid);
            }, MARK_CLEAR_GRACE_MS);
            timers.add(timer);
        });
        return () => {
            unsubscribe();
            for (const timer of timers) clearTimeout(timer);
        };
    }, [clear]);

    const joinedCloudIds = useJoinedCloudIds(ownedClouds, invitedClouds);
    const cids = useMemo(() => [RELAY_CLOUD_ID, ...joinedCloudIds], [joinedCloudIds]);
    const cidsKey = cids.join(',');

    const handleReceiveNotification = useCallback(
        (message: AppMessageData<'OnReceiveNotification'>) => {
            const data = message.data?.notification?.data;
            if (!data || !isChatPush(data)) return;

            const hint = extractPushCloudHint(data);
            void resolvePushCloudId(hint, { cids, resolveContext }).then(cloudId => {
                if (!cloudId || cloudId === selectedCloudId) return;
                mark(cloudId);
            });
        },
        [cidsKey, resolveContext, selectedCloudId, mark]
    );

    useOnReceiveNotification(handleReceiveNotification);

    const drainNativeMarks = useCallback(async () => {
        const records = await appBridge.fetchPushMarks();
        if (records.length > 0) {
            logger.info('PUSH_EVENT', `drained ${records.length} background push mark(s) (lower bound)`, {
                count: records.length,
                cids: records.map(record => record.cid).filter(Boolean),
            });
        }
        for (const hint of records) {
            const cloudId = await resolvePushCloudId(hint, { cids, resolveContext });
            if (!cloudId || cloudId === selectedCloudId) continue;
            mark(cloudId);
        }
    }, [cidsKey, resolveContext, selectedCloudId, mark]);

    useEffect(() => {
        void drainNativeMarks();
    }, []);

    useOnBackgroundStatusChanged(message => {
        if (message.data.isForeground) void drainNativeMarks();
    });

    useEffect(() => {
        if (isVerified && selectedCloudId && activeBadged) clear(selectedCloudId);
    }, [isVerified, selectedCloudId, activeBadged, clear]);

    return null;
};
