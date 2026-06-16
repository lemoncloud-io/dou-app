import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@chatic/bridges';
import { useWebSocketV2Store } from '@chatic/socket';
import type { DomainChannel, DomainChannelListPayload } from '@chatic/data';
import { cloudCore, useDynamicProfile, useUserContext } from '@chatic/web-core';

import { useRepositories } from '@chatic/app-runtime';
import type { ClientChannelView } from '../types';

import { useChannelSyncStore } from '../stores/useChannelSyncStore';
import { useConnectionRecoverySync } from './useConnectionRecoverySync';

const DEFAULT_CHANNEL_LIMIT = 100;

export interface ChannelDebugInfo {
    fetchCount: number;
    lastFetchAt: string | null;
    lastFetchResultCount: number | null;
    isVerified: boolean;
    isConnected: boolean;
    cloudId: string | null;
    targetPlaceId: string | undefined;
}

// 컴포넌트 재마운트와 실제 클라우드/place 전환을 구분하기 위한 모듈 레벨 변수
let lastFetchedCloudId: string | null | undefined;
let lastFetchedPlaceId: string | undefined;

const toClientChannel = (channel: DomainChannel, userId?: string): ClientChannelView => {
    const lastChatNo = channel.lastChat$?.chatNo ?? channel.chatNo ?? 0;
    const lastMessageIsMine = channel.lastChat$?.ownerId === userId;
    const myReadNo = lastMessageIsMine ? lastChatNo : (channel.$join?.chatNo ?? 0);
    const memberCount = channel.memberNo ?? channel.memberIds?.length ?? channel.$joins?.length ?? 0;

    // $join이 있으면 로컬 계산을 우선 사용 — join:update 이벤트로 $join.chatNo가 갱신되었을 때
    // 서버의 channel.unreadCount는 아직 stale한 경우가 있어 깜빡임(flicker) 발생
    const localUnread = Math.max(0, lastChatNo - myReadNo);
    const unreadCount = channel.$join ? localUnread : (channel.unreadCount ?? localUnread);

    return {
        ...channel,
        isOwner: channel.ownerId === userId,
        isSelfChat: channel.stereo === 'self',
        memberCount,
        unreadCount,
    };
};

const sortChannels = (channels: ClientChannelView[]) =>
    [...channels].sort((a, b) => {
        const timeA = new Date(a.lastChat$?.createdAt ?? a.updatedAt ?? 0).getTime();
        const timeB = new Date(b.lastChat$?.createdAt ?? b.updatedAt ?? 0).getTime();
        return timeB - timeA;
    });

const buildFetchPayload = ({ sid: _placeId, ...params }: DomainChannelListPayload): DomainChannelListPayload => ({
    sid: _placeId,
    limit: params.limit ?? DEFAULT_CHANNEL_LIMIT,
    page: params.page,
    detail: params.detail,
});

export const useChannels = (initialParams: DomainChannelListPayload) => {
    const { channel: channelRepository } = useRepositories();
    const profile = useDynamicProfile();
    const { currentWSS } = useUserContext();
    const userId = profile?.uid;
    const targetPlaceId = initialParams.sid;
    const storeCloudId = useWebSocketV2Store(s => s.cloudId);
    const isConnected = useWebSocketV2Store(s => s.isConnected);
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const cloudId = storeCloudId || cloudCore.getSelectedCloudId() || null;

    const currentParamsRef = useRef(initialParams);
    const requestSeqRef = useRef(0);
    const userIdRef = useRef(userId);
    userIdRef.current = userId;
    const cloudIdRef = useRef(cloudId);
    cloudIdRef.current = cloudId;
    const targetPlaceIdRef = useRef(targetPlaceId);
    targetPlaceIdRef.current = targetPlaceId;

    const [channels, setChannels] = useState<ClientChannelView[]>([]);
    const channelsRef = useRef(channels);
    channelsRef.current = channels;

    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isError, setIsError] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const [debugInfo, setDebugInfo] = useState({
        fetchCount: 0,
        lastFetchAt: null as string | null,
        lastFetchResultCount: null as number | null,
    });

    // 렌더 단계에서 cloud/place 전환 감지 — 이전 place의 채널이 한 프레임 보이는 현상(flash) 방지
    const [prevCloudId, setPrevCloudId] = useState(cloudId);
    const [prevPlaceId, setPrevPlaceId] = useState(targetPlaceId);

    if ((!!prevCloudId && prevCloudId !== cloudId) || (!!prevPlaceId && prevPlaceId !== targetPlaceId)) {
        setChannels([]);
        setIsLoading(true);
    }
    if (prevCloudId !== cloudId) setPrevCloudId(cloudId);
    if (prevPlaceId !== targetPlaceId) setPrevPlaceId(targetPlaceId);

    // IndexedDB(channelRepository)에서 캐시 읽기 — 공통 헬퍼
    const loadFromCache = useCallback(
        async (params: DomainChannelListPayload, requestSeq: number): Promise<ClientChannelView[]> => {
            const cacheResult = await channelRepository.fetchChannel(buildFetchPayload(params), {
                cachePolicy: 'cache-only',
            });
            if (requestSeqRef.current !== requestSeq) return [];
            return sortChannels(
                (cacheResult.list ?? []).map((ch: DomainChannel) => toClientChannel(ch, userIdRef.current))
            );
        },
        [channelRepository]
    );

    // 단일 fetch 함수 — 결과를 항상 직접 반영
    const fetchChannels = useCallback(
        async (options?: { loading?: boolean; forceNetwork?: boolean; silent?: boolean }) => {
            const params = currentParamsRef.current;
            if (!params.sid) return;

            const requestSeq = ++requestSeqRef.current;

            if (options?.loading) setIsLoading(true);
            if (options?.forceNetwork && !options?.silent) setIsSyncing(true);
            setIsError(false);
            setErrorMessage(null);

            // 표시할 데이터가 없으면 IndexedDB에서 먼저 로드하여 즉시 표시
            if (channelsRef.current.length === 0) {
                try {
                    const cached = await loadFromCache(params, requestSeq);
                    if (requestSeqRef.current !== requestSeq) return;
                    if (cached.length > 0) {
                        setChannels(cached);
                        setIsLoading(false);
                    }
                } catch {
                    // 캐시 읽기 실패 무시 — 네트워크 요청으로 진행
                }
            }

            const cachePolicy = options?.forceNetwork ? 'network-only' : 'cache-first';
            logger.info('CHANNEL', '[useChannels] fetchChannels start', {
                data: { sid: params.sid, cachePolicy, forceNetwork: options?.forceNetwork },
            });

            try {
                const result = await channelRepository.fetchChannel(buildFetchPayload(params), { cachePolicy });
                if (requestSeqRef.current !== requestSeq) return;

                const nextChannels = sortChannels(
                    (result.list ?? []).map((ch: DomainChannel) => toClientChannel(ch, userIdRef.current))
                );
                logger.info('CHANNEL', '[useChannels] fetchChannels result', {
                    data: { resultCount: nextChannels.length, source: result.meta?.source },
                });

                setChannels(nextChannels);
                setDebugInfo(prev => ({
                    fetchCount: prev.fetchCount + 1,
                    lastFetchAt: new Date().toISOString(),
                    lastFetchResultCount: nextChannels.length,
                }));
            } catch (error) {
                if (requestSeqRef.current !== requestSeq) return;
                const message = error instanceof Error ? error.message : String(error);
                logger.error('CHANNEL', '[useChannels] fetchChannels failed', { error });
                setIsError(true);
                setErrorMessage(message);
            } finally {
                if (requestSeqRef.current === requestSeq) {
                    setIsLoading(false);
                    if (options?.forceNetwork) setIsSyncing(false);
                }
            }
        },
        [channelRepository, loadFromCache]
    );

    const syncFromServer = useCallback(async () => {
        // store/ref에서 직접 읽어 stale closure 방지
        const currentCloudId = cloudIdRef.current;
        const { isVerified: currentIsVerified } = useWebSocketV2Store.getState();
        if (!currentCloudId || !currentIsVerified) return;

        const { getSyncedAt, setSyncedAt, setStatus } = useChannelSyncStore.getState();
        const since = getSyncedAt(currentCloudId);

        setStatus('syncing');
        try {
            const result = await channelRepository.syncChannels(since);
            if (cloudIdRef.current !== currentCloudId) return;

            setSyncedAt(currentCloudId, result.syncedAt);
            setStatus('synced');

            // sync 완료 후 항상 캐시에서 읽어 화면 반영 (updatedCount 조건 제거)
            const params = currentParamsRef.current;
            if (params.sid) {
                const requestSeq = ++requestSeqRef.current;
                const cached = await loadFromCache(params, requestSeq);
                if (requestSeqRef.current === requestSeq) {
                    setChannels(cached);
                }
            }

            logger.info('CHANNEL', '[useChannels] syncFromServer complete', {
                data: { since, syncedAt: result.syncedAt, updated: result.updatedCount, removed: result.removedCount },
            });
        } catch (error) {
            if (cloudIdRef.current !== currentCloudId) return;
            setStatus('error', error instanceof Error ? error.message : String(error));
            logger.error('CHANNEL', '[useChannels] syncFromServer failed', { error });
        }
    }, [channelRepository, loadFromCache]);

    // isVerified 전이라도 IndexedDB 캐시에서 채널을 즉시 읽기
    useEffect(() => {
        if (!cloudId || !targetPlaceId || isVerified) return;

        const requestSeq = ++requestSeqRef.current;
        const doLoad = async () => {
            try {
                const cached = await loadFromCache({ ...currentParamsRef.current, sid: targetPlaceId }, requestSeq);
                if (requestSeqRef.current !== requestSeq) return;
                if (cached.length > 0) {
                    setChannels(cached);
                    setIsLoading(false);
                }
            } catch {
                // 캐시 읽기 실패는 무시 — isVerified 후 정상 fetch에서 처리
            }
        };
        void doLoad();
    }, [cloudId, targetPlaceId, isVerified, loadFromCache]);

    // cloudId/place가 변경되고 인증 완료 시 채널 목록 재요청
    const prevFetchKeyRef = useRef<string | undefined>(undefined);

    useEffect(() => {
        if (!cloudId || !targetPlaceId || !isVerified) return;
        const fetchKey = `${cloudId}:${targetPlaceId}`;
        if (prevFetchKeyRef.current === fetchKey) return;
        prevFetchKeyRef.current = fetchKey;

        const isCloudSwitch = lastFetchedCloudId !== undefined && lastFetchedCloudId !== cloudId;
        const isPlaceSwitch = lastFetchedPlaceId !== undefined && lastFetchedPlaceId !== targetPlaceId;

        lastFetchedCloudId = cloudId;
        lastFetchedPlaceId = targetPlaceId;
        currentParamsRef.current = initialParams;

        if (isCloudSwitch) {
            useChannelSyncStore.getState().setStatus('idle');
        }

        // 캐시에서 즉시 표시 → channel:mine으로 서버 최신 데이터로 교체
        void fetchChannels({ loading: channelsRef.current.length === 0 }).then(() => {
            void fetchChannels({ forceNetwork: true, silent: true });
        });
    }, [fetchChannels, cloudId, targetPlaceId, isVerified]);

    // 캐시(IndexedDB) 변경을 subscribeList로 자동 감지하여 UI 반영
    // channel:create/update/delete, chat:create, join:update 등 모든 캐시 기록이
    // ChannelRepository.initializeInternalListeners를 통해 localDataSource에 반영되고,
    // subscribeList가 이를 감지하여 콜백을 호출합니다.
    // requestSeqRef를 건드리지 않으므로 fetchChannels의 network 응답이 drop되지 않습니다.
    useEffect(() => {
        if (!targetPlaceId) return;

        const unsub = channelRepository.subscribeList(
            buildFetchPayload({ ...currentParamsRef.current, sid: targetPlaceId }),
            result => {
                if (!result) return;
                const nextChannels = sortChannels(
                    (result.list ?? []).map((ch: DomainChannel) => toClientChannel(ch, userIdRef.current))
                );
                setChannels(nextChannels);
            }
        );

        return unsub;
    }, [channelRepository, targetPlaceId]);

    // 포그라운드 복귀 및 WebSocket 재연결 시 channel:mine 재요청
    const syncFromLocal = useCallback(async () => {
        const params = currentParamsRef.current;
        if (!params.sid) return;
        const requestSeq = ++requestSeqRef.current;
        const cached = await loadFromCache(params, requestSeq);
        if (requestSeqRef.current === requestSeq && cached.length > 0) {
            setChannels(cached);
        }
    }, [loadFromCache]);

    const triggerNetworkFetch = useCallback(() => {
        void fetchChannels({ forceNetwork: true, silent: true });
    }, [fetchChannels]);

    useConnectionRecoverySync(syncFromLocal, triggerNetworkFetch);

    // 포그라운드 복귀 시 channel:mine으로 채널 리스트 최신화
    useEffect(() => {
        let hiddenAt: number | null = null;
        const handler = () => {
            if (document.visibilityState === 'hidden') {
                hiddenAt = Date.now();
                return;
            }
            if (document.visibilityState !== 'visible' || hiddenAt === null) return;
            const elapsed = Date.now() - hiddenAt;
            hiddenAt = null;
            if (elapsed < 5_000) return;

            void fetchChannels({ forceNetwork: true, silent: true });
        };
        document.addEventListener('visibilitychange', handler);
        return () => document.removeEventListener('visibilitychange', handler);
    }, [fetchChannels]);

    const fullDebugInfo: ChannelDebugInfo = {
        ...debugInfo,
        isVerified,
        isConnected,
        cloudId,
        targetPlaceId,
    };

    return {
        channels: currentWSS === 'cloud' ? channels.filter(c => !!c.$?.sid) : channels,
        isLoading,
        isSyncing,
        isError,
        errorMessage,
        refresh: () => fetchChannels({ forceNetwork: true }),
        sync: () => syncFromServer(),
        debugInfo: fullDebugInfo,
    };
};
