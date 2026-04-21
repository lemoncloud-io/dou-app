import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChannelView, JoinView } from '@lemoncloud/chatic-socials-api';
import type { CacheChannelView } from '@chatic/app-messages';
import { useWebSocketV2 } from '@chatic/socket';
import { useDynamicProfile } from '@chatic/web-core';
import type { AppSyncDetail } from '../sync-events';
import { APP_SYNC_EVENT_NAME } from '../sync-events';
import { useChannelRepository, useJoinRepository } from '../repository';
import type { ClientChannelView, ClientChatMinePayload } from '../types';
import { shouldEmit } from '../requestDedup';
import { useConnectionRecoverySync } from './useConnectionRecoverySync';

/**
 * 특정 워크스페이스(Place)의 채널 목록을 로컬 DB에서 즉시 조회
 * 백그라운드에서 최신 데이터를 서버에 요청하여 동기화하는 Query 훅
 */
export const useChannels = (initialParams: ClientChatMinePayload) => {
    const targetPlaceId = initialParams.placeId;
    const { emitAuthenticated, cloudId } = useWebSocketV2();

    // 현재 접속 중인 내 프로필 정보
    const profile = useDynamicProfile();
    const channelRepository = useChannelRepository(cloudId, profile?.uid);
    const joinRepository = useJoinRepository(cloudId, profile?.uid);
    const [channels, setChannels] = useState<ClientChannelView[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isError, setIsError] = useState(false);

    const currentParamsRef = useRef<ClientChatMinePayload>(initialParams);
    const isSyncingRef = useRef(false);

    // cloudId가 유효한지 확인 (빈 문자열이면 무효 — stale 캐시 접근 방지)
    // 'default'는 중계서버(relay WSS) 케이스에서 정상 사용됨
    const isValidCloudId = !!cloudId;

    /**
     * 로컬 DB에서 채널 목록 읽어오기 및 정렬
     */
    const requestFromLocal = useCallback(
        async (params?: ClientChatMinePayload) => {
            try {
                if (!isValidCloudId) {
                    setIsLoading(false);
                    return;
                }
                setIsError(false);
                if (params) {
                    currentParamsRef.current = { ...currentParamsRef.current, ...params };
                }
                const activeParams = currentParamsRef.current;
                const placeId = activeParams.placeId;

                if (!placeId) {
                    setChannels([]);
                    setIsLoading(false);
                    return;
                }

                // 'default' placeId는 sid 필터 없이 전체 채널 로드
                const channelsData: CacheChannelView[] =
                    placeId === 'default'
                        ? await channelRepository.getChannels()
                        : await channelRepository.getChannelsByPlace(placeId);

                const sortedChannels = channelsData.sort((a, b) => {
                    const timeA = new Date(a.lastChat$?.createdAt ?? a.updatedAt ?? 0).getTime();
                    const timeB = new Date(b.lastChat$?.createdAt ?? b.updatedAt ?? 0).getTime();
                    return timeB - timeA;
                });

                let targetChannels = sortedChannels;
                if (activeParams.limit) {
                    const limit = activeParams.limit;
                    const page = activeParams.page ?? 0;
                    const startIndex = page * limit;
                    targetChannels = sortedChannels.slice(startIndex, startIndex + limit);
                }

                // 각 채널 마다 getJoinsByChannel 호출 후 내 읽음 상태 매핑
                const resultChannels: ClientChannelView[] = await Promise.all(
                    targetChannels.map(async ({ sid, ...rest }) => {
                        const baseChannel = rest as ChannelView;
                        let unreadCount = 0;

                        if (profile?.uid && baseChannel.id) {
                            // 해당 채널의 모든 join 정보 가져오기
                            const joins = await joinRepository.getJoinsByChannel(baseChannel.id);

                            // 내 UID와 일치하는 Join 찾기
                            const myJoin = (joins as JoinView[]).find(j => j.userId === profile.uid);

                            // 차이 계산
                            const lastChatNo = baseChannel.lastChat$?.chatNo || 0;
                            // 마지막 메시지가 내 것이면 이미 읽은 것으로 간주
                            const lastMsgIsMine = baseChannel.lastChat$?.ownerId === profile.uid;
                            const myReadNo = lastMsgIsMine ? lastChatNo : myJoin?.chatNo || 0;
                            unreadCount = Math.max(0, lastChatNo - myReadNo);
                        }

                        return {
                            ...baseChannel,
                            isOwner: baseChannel.ownerId === profile?.uid,
                            isSelfChat: baseChannel.stereo === 'self',
                            memberCount: baseChannel.memberNo || 0,
                            unreadCount,
                        };
                    })
                );

                setChannels(resultChannels);
            } catch (error) {
                console.error('Failed to load channels from DB:', error);
                setIsError(true);
            } finally {
                setIsLoading(false);
            }
        },
        [channelRepository, joinRepository, profile?.uid, isValidCloudId]
    );

    /**
     * 서버에 최신 채널 목록 동기화 요청
     */
    const requestFromNetwork = useCallback(
        (params?: ClientChatMinePayload) => {
            if (isSyncingRef.current || !isValidCloudId) return;
            if (params) {
                currentParamsRef.current = { ...currentParamsRef.current, ...params };
            }
            const activeParams = currentParamsRef.current;
            const placeId = activeParams.placeId;

            if (!placeId) return;
            if (!shouldEmit(`chat:mine:${placeId}`)) return;

            isSyncingRef.current = true;
            setIsSyncing(true);

            // 'default' placeId는 서버에 전달하지 않음 — 서버가 전체 채널 반환
            const { placeId: _pid, ...restParams } = activeParams;
            const networkPayload = placeId === 'default' ? restParams : activeParams;

            emitAuthenticated({
                type: 'chat',
                action: 'mine',
                payload: networkPayload,
            });

            setTimeout(() => {
                isSyncingRef.current = false;
                setIsSyncing(false);
            }, 5000);
        },
        [emitAuthenticated, isValidCloudId]
    );

    const requestFromLocalRef = useRef(requestFromLocal);
    requestFromLocalRef.current = requestFromLocal;
    const requestFromNetworkRef = useRef(requestFromNetwork);
    requestFromNetworkRef.current = requestFromNetwork;

    // 초기 마운트 및 placeId 변경 시 로컬 DB 조회
    useEffect(() => {
        currentParamsRef.current = initialParams;
        isSyncingRef.current = false;
        setChannels([]); // 즉시 이전 채널 제거 → 스켈레톤 표시
        setIsLoading(true);
        void requestFromLocalRef.current(initialParams);
        requestFromNetworkRef.current({ ...initialParams, limit: 100 });
    }, [targetPlaceId]);

    useEffect(() => {
        // cloudId나 Repository가 준비되지 않았다면 리스너를 등록하지 않음
        if (!isValidCloudId || !joinRepository.cloudId) return;

        const handleUpdate = (e: Event) => {
            const { detail } = e as CustomEvent<AppSyncDetail>;

            const isTargetDomain = ['channel', 'chat', 'join'].includes(detail.domain);
            const isMatchingCloud = detail.cid === joinRepository.cloudId;

            if (isTargetDomain && isMatchingCloud) {
                // 모든 타겟 도메인에 대해 로컬 DB 즉시 로드
                void requestFromLocalRef.current();

                if (detail.domain === 'join') {
                    // 'join' 도메인일 경우에만 서버 동기화(원격) 요청 수행; (domain:model; action:update; type:join)
                    requestFromNetworkRef.current();
                } else {
                    // 'channel', 'chat' 등 나머지는 로컬 로드만 수행 후 동기화 상태 해제
                    isSyncingRef.current = false;
                    setIsSyncing(false);
                }
                // 채팅 이벤트(send, model:create 등) 수신 시 서버에서 최신 채널 목록을 다시 가져옴
                // model:create:chat은 채널 데이터(lastChat$, unreadCount)를 로컬에 갱신하지 않으므로
                // 서버에 chat:mine을 재요청하여 정확한 채널 상태를 동기화
                if (detail.domain === 'chat') {
                    requestFromNetworkRef.current({ ...currentParamsRef.current, limit: 100 });
                }
            }
        };

        window.addEventListener(APP_SYNC_EVENT_NAME, handleUpdate);
        return () => window.removeEventListener(APP_SYNC_EVENT_NAME, handleUpdate);
    }, [isValidCloudId, joinRepository.cloudId]);

    // 포그라운드 복귀 + WebSocket 재연결 완료 시 데이터 재동기화
    useConnectionRecoverySync(requestFromLocal, requestFromNetwork);

    return {
        channels,
        isLoading,
        isSyncing,
        isError,
        refresh: (options?: ClientChatMinePayload) => {
            void requestFromLocal(options);
            requestFromNetwork(options);
        },
        sync: (options?: ClientChatMinePayload) => requestFromNetwork(options),
    };
};
