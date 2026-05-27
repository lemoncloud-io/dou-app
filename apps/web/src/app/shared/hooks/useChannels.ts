import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@chatic/app-messages';
import { useInterval } from '@chatic/shared';
import { useWebSocketV2Store } from '@chatic/socket';
import type { DomainChannel, DomainChannelListPayload, DomainChat, DomainJoin } from '@chatic/data';
import { cloudCore, useDynamicProfile } from '@chatic/web-core';

import { useRepositories } from '../data';
import type { ClientChannelView } from '../types';
import { debounce } from '../utils/debounce';

const DEFAULT_CHANNEL_LIMIT = 100;
const CHANNEL_POLL_INTERVAL_MS = 15_000;

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
    const { channel: channelRepository, chat: chatRepository, join: joinRepository } = useRepositories();
    const profile = useDynamicProfile();
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
        async (options?: { loading?: boolean; forceNetwork?: boolean }) => {
            const params = currentParamsRef.current;
            if (!params.sid) return;

            const requestSeq = ++requestSeqRef.current;

            if (options?.loading) setIsLoading(true);
            if (options?.forceNetwork) setIsSyncing(true);
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

        const isSwitch =
            (lastFetchedCloudId !== undefined && lastFetchedCloudId !== cloudId) ||
            (lastFetchedPlaceId !== undefined && lastFetchedPlaceId !== targetPlaceId);

        lastFetchedCloudId = cloudId;
        lastFetchedPlaceId = targetPlaceId;

        currentParamsRef.current = initialParams;
        void fetchChannels({
            loading: isSwitch || channelsRef.current.length === 0,
            // cache-first: 캐시 데이터가 있으면 즉시 표시 + 백그라운드 네트워크 갱신
            // network-only를 쓰면 WebSocket 응답 + bridge 왕복을 모두 대기해야 하므로 느림
        });
    }, [fetchChannels, cloudId, targetPlaceId, isVerified]);

    // 채널/채팅/조인 이벤트에 대한 동기화 트리거
    useEffect(() => {
        const debouncedFetch = debounce(() => fetchChannels({ forceNetwork: true }), 300);

        const unsubs = [
            channelRepository.onChannelCreated(() => void debouncedFetch()),
            channelRepository.onChannelUpdated(() => void debouncedFetch()),
            channelRepository.onChannelDeleted(() => void debouncedFetch()),
            chatRepository.onChatCreated((chat: DomainChat) => {
                if (!chat.channelId || channelsRef.current.length === 0) return;
                if (channelsRef.current.some(ch => ch.id === chat.channelId)) {
                    void debouncedFetch();
                }
            }),
            joinRepository.onJoinUpdated((join: DomainJoin) => {
                if (!join.channelId || channelsRef.current.length === 0) return;
                if (channelsRef.current.some(ch => ch.id === join.channelId)) {
                    void debouncedFetch();
                }
            }),
        ];

        return () => unsubs.forEach(fn => fn());
    }, [channelRepository, chatRepository, joinRepository, fetchChannels]);

    // 채널 목록 주기적 폴링 (WebSocket push 누락 시 보완)
    useInterval(() => void fetchChannels(), targetPlaceId && cloudId ? CHANNEL_POLL_INTERVAL_MS : null);

    const fullDebugInfo: ChannelDebugInfo = {
        ...debugInfo,
        isVerified,
        isConnected,
        cloudId,
        targetPlaceId,
    };

    return {
        channels,
        isLoading,
        isSyncing,
        isError,
        errorMessage,
        refresh: () => fetchChannels({ forceNetwork: true }),
        sync: (options?: DomainChannelListPayload) => {
            if (options) currentParamsRef.current = { ...currentParamsRef.current, ...options };
            return fetchChannels();
        },
        debugInfo: fullDebugInfo,
    };
};
