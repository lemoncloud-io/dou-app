import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChannelView, JoinView } from '@lemoncloud/chatic-socials-api';
import type { CacheChannelView } from '@chatic/app-messages';
import { useWebSocketV2 } from '@chatic/socket';
import { useDynamicProfile } from '@chatic/web-core';
import type { AppSyncDetail } from '../sync-events';
import { APP_SYNC_EVENT_NAME } from '../sync-events';
import { useChannelLocalDataSource, useJoinLocalDataSource } from '../local/data-sources';
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
    const channelRepository = useChannelLocalDataSource(cloudId, profile?.uid);
    const joinRepository = useJoinLocalDataSource(cloudId, profile?.uid);
    const [channels, setChannels] = useState<ClientChannelView[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isError, setIsError] = useState(false);

    const currentParamsRef = useRef<ClientChatMinePayload>(initialParams);
    const isSyncingRef = useRef(false);
    const profileRef = useRef(profile);
    profileRef.current = profile;

    // 서버 chat:mine 응답으로 확인된 채널 ID 목록. null은 아직 서버 응답 없음(로딩 중)을 의미.
    const confirmedChannelIdsRef = useRef<Set<string> | null>(null);

    // cloudId가 유효한지 확인 (빈 문자열이면 무효 — stale 캐시 접근 방지)
    // 'default'는 중계서버(relay WSS) 케이스에서 정상 사용됨
    const isValidCloudId = !!cloudId;

    /**
     * 로컬 DB에서 채널 목록 읽어오기 및 정렬
     * NOTE: 현재 사용하지 않음 — stale 캐시 노출 방지를 위해 서버 fast path로 대체됨
     * 추후 오프라인 모드 등에서 필요할 수 있어 함수는 보존
     */
     
    const requestFromLocal = useCallback(
        async (params?: ClientChatMinePayload) => {
            try {
                if (!isValidCloudId) {
                    setIsLoading(false);
                    return;
                }

                // 서버 응답 전이면 로딩 상태 유지 (stale 캐시 표시 방지)
                if (confirmedChannelIdsRef.current === null) {
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

                // 서버가 확인한 채널 ID로 필터링하여 stale 채널 제거
                const confirmedIds = confirmedChannelIdsRef.current;
                const filteredChannels = channelsData.filter(ch => ch.id && confirmedIds.has(ch.id));

                const sortedChannels = filteredChannels.sort((a, b) => {
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
            if (!shouldEmit(`chat:mine:${placeId}:${cloudId}`)) return;

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
        [emitAuthenticated, isValidCloudId, cloudId]
    );

    // NOTE: requestFromLocal은 현재 미사용 — ref도 보존만 (호출 X)
    const requestFromLocalRef = useRef(requestFromLocal);
    requestFromLocalRef.current = requestFromLocal;
    const requestFromNetworkRef = useRef(requestFromNetwork);
    requestFromNetworkRef.current = requestFromNetwork;

    // 초기 마운트 및 placeId/cloudId 변경 시 서버에서 채널 목록 요청
    // cloudId dep: cloud 전환 시 store의 cloudId가 비동기로 갱신되므로,
    // 안정화된 cloudId로 재요청하여 isMatchingCloud 불일치 방지
    useEffect(() => {
        currentParamsRef.current = initialParams;
        isSyncingRef.current = false;
        confirmedChannelIdsRef.current = null; // 서버 응답 전까지 로딩 상태 유지
        setChannels([]); // 즉시 이전 채널 제거 → 스켈레톤 표시
        setIsLoading(true);
        requestFromNetworkRef.current({ ...initialParams, limit: 100 });
    }, [targetPlaceId, cloudId]);

    useEffect(() => {
        // cloudId나 Repository가 준비되지 않았다면 리스너를 등록하지 않음
        if (!isValidCloudId || !joinRepository.cloudId) return;

        const handleUpdate = (e: Event) => {
            const { detail } = e as CustomEvent<AppSyncDetail>;

            const isTargetDomain = ['channel', 'chat', 'join'].includes(detail.domain);
            const isMatchingCloud = detail.cid === joinRepository.cloudId;

            if (isTargetDomain && isMatchingCloud) {
                // confirmed channel IDs 갱신
                if (detail.domain === 'channel') {
                    if (detail.action === 'mine') {
                        // 서버 chat:mine 응답 → confirmed set 전체 교체
                        const list = detail.payload?.list || [];
                        confirmedChannelIdsRef.current = new Set(list.map((ch: any) => ch.id));

                        // Fast path: 서버 payload로 즉시 채널 표시 (DB round-trip 스킵)
                        const uid = profileRef.current?.uid;
                        if (list.length > 0) {
                            const sorted = [...list].sort((a: any, b: any) => {
                                const timeA = new Date(a.lastChat$?.createdAt ?? a.updatedAt ?? 0).getTime();
                                const timeB = new Date(b.lastChat$?.createdAt ?? b.updatedAt ?? 0).getTime();
                                return timeB - timeA;
                            });
                            setChannels(
                                sorted.map((ch: any) => {
                                    const lastChatNo = ch.lastChat$?.chatNo || 0;
                                    const lastMsgIsMine = ch.lastChat$?.ownerId === uid;
                                    const myReadNo = lastMsgIsMine ? lastChatNo : ch.$join?.chatNo || 0;
                                    return {
                                        ...ch,
                                        isOwner: ch.ownerId === uid,
                                        isSelfChat: ch.stereo === 'self',
                                        memberCount: ch.memberNo || 0,
                                        unreadCount: Math.max(0, lastChatNo - myReadNo),
                                    };
                                })
                            );
                        } else {
                            setChannels([]);
                        }
                        setIsLoading(false);
                        isSyncingRef.current = false;
                        setIsSyncing(false);
                        // mine은 fast path에서 완전 처리 — requestFromLocal()이 sid 불일치로 덮어쓰는 것 방지
                        return;
                    } else if (detail.action === 'start' && detail.targetId) {
                        // 새 채널 생성 → confirmed set에 추가
                        confirmedChannelIdsRef.current?.add(detail.targetId);
                    } else if (detail.action === 'delete-channel' && detail.targetId) {
                        // 채널 삭제 → confirmed set에서 제거
                        confirmedChannelIdsRef.current?.delete(detail.targetId);
                    } else if (detail.action === 'leave' && detail.targetId) {
                        // 채널 나가기 → confirmed set에서 제거
                        confirmedChannelIdsRef.current?.delete(detail.targetId);
                    }
                }

                // channel(start/delete/leave), chat, join 이벤트 → 서버에 재요청
                isSyncingRef.current = false;
                requestFromNetworkRef.current({ ...currentParamsRef.current, limit: 100 });
            }
        };

        window.addEventListener(APP_SYNC_EVENT_NAME, handleUpdate);
        return () => window.removeEventListener(APP_SYNC_EVENT_NAME, handleUpdate);
    }, [isValidCloudId, joinRepository.cloudId]);

    // 포그라운드 복귀 + WebSocket 재연결 완료 시 데이터 재동기화
    // Recovery 시 isSyncingRef를 리셋하여 이전 실패/대기 중인 요청이 retry를 차단하지 않도록 함
    const requestFromNetworkForRecovery = useCallback(() => {
        isSyncingRef.current = false;
        requestFromNetwork();
    }, [requestFromNetwork]);
    useConnectionRecoverySync(requestFromNetworkForRecovery, requestFromNetworkForRecovery);

    return {
        channels,
        isLoading,
        isSyncing,
        isError,
        refresh: (options?: ClientChatMinePayload) => {
            isSyncingRef.current = false;
            requestFromNetwork(options);
        },
        sync: (options?: ClientChatMinePayload) => requestFromNetwork(options),
    };
};
