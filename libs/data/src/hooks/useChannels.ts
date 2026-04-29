import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChannelView, JoinView } from '@lemoncloud/chatic-socials-api';
import type { CacheChannelView } from '@chatic/app-messages';
import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
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
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const currentParamsRef = useRef<ClientChatMinePayload>(initialParams);
    const isSyncingRef = useRef(false);
    const profileRef = useRef(profile);
    profileRef.current = profile;

    // 서버 chat:mine 응답으로 확인된 채널 ID 목록. null은 아직 서버 응답 없음(로딩 중)을 의미.
    const confirmedChannelIdsRef = useRef<Set<string> | null>(null);

    // chat:mine 응답 없을 시 재시도
    const retryCountRef = useRef(0);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
            // 미인증 상태에서는 emit 스킵 — emitAuthenticated의 deferred queue에 중복 누적 방지
            // isVerified effect가 인증 완료 시 재요청을 트리거함
            if (!useWebSocketV2Store.getState().isVerified) return;
            // cloudId를 dedup key에서 제외 — 초기 'default'→실제 cloudId 전환 시 동일 placeId 요청이 중복 발송되는 것 방지
            if (!shouldEmit(`chat:mine:${placeId}`)) return;

            isSyncingRef.current = true;
            setIsSyncing(true);

            // placeId는 서버에 전달하지 않음 — refreshToken 후 서버가 place 컨텍스트를 이미 알고 있음
            const { placeId: _pid, ...restParams } = activeParams;

            emitAuthenticated({
                type: 'chat',
                action: 'mine',
                payload: restParams,
            });

            // 이전 타이머 정리
            if (retryTimerRef.current) {
                clearTimeout(retryTimerRef.current);
            }

            // 1초 후 응답 없으면 재시도 (최대 10회)
            retryTimerRef.current = setTimeout(() => {
                isSyncingRef.current = false;
                setIsSyncing(false);

                if (confirmedChannelIdsRef.current === null && retryCountRef.current < 10) {
                    retryCountRef.current += 1;
                    console.warn(`[useChannels] chat:mine no response, retry ${retryCountRef.current}/10`);
                    requestFromNetworkRef.current();
                } else if (confirmedChannelIdsRef.current === null) {
                    console.error('[useChannels] chat:mine failed after 10 retries');
                    setIsLoading(false);
                    setIsError(true);
                    setErrorMessage('chat:mine timeout');
                }
            }, 1000);
        },
        [emitAuthenticated, isValidCloudId, cloudId]
    );

    // NOTE: requestFromLocal은 현재 미사용 — ref도 보존만 (호출 X)
    const requestFromLocalRef = useRef(requestFromLocal);
    requestFromLocalRef.current = requestFromLocal;
    const requestFromNetworkRef = useRef(requestFromNetwork);
    requestFromNetworkRef.current = requestFromNetwork;

    // cloudId 변경 시 상태 리셋 + (실제 변경이면) targetPlaceId가 유효할 때 재요청
    const prevCloudIdRef = useRef<string | undefined>(undefined);
    useEffect(() => {
        const isInitialMount = prevCloudIdRef.current === undefined;
        prevCloudIdRef.current = cloudId;

        currentParamsRef.current = initialParams;
        isSyncingRef.current = false;
        confirmedChannelIdsRef.current = null;
        retryCountRef.current = 0;
        if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
        }
        setChannels([]);
        setIsLoading(true);
        setIsError(false);
        setErrorMessage(null);

        // 초기 마운트가 아닌 실제 cloudId 변경 시에만 재요청
        // 초기 마운트에서는 [targetPlaceId] effect가 요청을 처리
        if (!isInitialMount && targetPlaceId) {
            requestFromNetworkRef.current({ ...initialParams, limit: 100 });
        }
    }, [cloudId]);

    // targetPlaceId 변경 시 서버에 채널 목록 요청
    // place가 제대로 선택된 후(refreshToken 완료 후)에만 chat:mine 발행
    useEffect(() => {
        if (!targetPlaceId) return;
        currentParamsRef.current = initialParams;
        isSyncingRef.current = false;
        confirmedChannelIdsRef.current = null;
        retryCountRef.current = 0;
        if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
        }
        setChannels([]);
        setIsLoading(true);
        setIsError(false);
        setErrorMessage(null);
        requestFromNetworkRef.current({ ...initialParams, limit: 100 });

        // Fallback: shouldEmit dedup이 다른 useChannels 인스턴스의 요청 때문에 차단된 경우,
        // dedup 윈도우(1s) 경과 후 재시도하여 stuck loading 방지
        const fallbackTimer = setTimeout(() => {
            if (confirmedChannelIdsRef.current === null) {
                isSyncingRef.current = false;
                retryCountRef.current = 0;
                requestFromNetworkRef.current({ ...currentParamsRef.current, limit: 100 });
            }
        }, 1500);

        return () => clearTimeout(fallbackTimer);
    }, [targetPlaceId]);

    // 인증 완료(isVerified: false→true) 시 아직 채널 목록을 못 가져온 상태면 재요청
    // handleSelectPlace에서 setIsVerified(false) → auth:update → setIsVerified(true) 순서에서
    // [targetPlaceId] effect의 requestFromNetwork가 미인증으로 스킵된 경우를 보완
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    useEffect(() => {
        if (isVerified && targetPlaceId && confirmedChannelIdsRef.current === null) {
            isSyncingRef.current = false;
            retryCountRef.current = 0;
            requestFromNetworkRef.current({ ...currentParamsRef.current, limit: 100 });
        }
    }, [isVerified]);

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
                        // stale 응답 무시: 응답의 placeId가 현재 요청 중인 placeId와 다르면 스킵
                        const responsePlaceId = detail.targetId;
                        const expectedPlaceId = currentParamsRef.current.placeId;
                        if (responsePlaceId && expectedPlaceId && responsePlaceId !== expectedPlaceId) {
                            return;
                        }

                        // 응답 수신 — 에러/재시도 상태 리셋
                        retryCountRef.current = 0;
                        if (retryTimerRef.current) {
                            clearTimeout(retryTimerRef.current);
                            retryTimerRef.current = null;
                        }
                        setIsError(false);
                        setErrorMessage(null);
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
                    } else if (detail.action === 'error') {
                        // chat 에러 응답 — 에러 상태 표시 + 1초 후 재시도
                        const errMsg = detail.payload?.error || 'Unknown error';
                        console.warn(`[useChannels] chat error: ${errMsg}`);
                        setErrorMessage(errMsg);
                        setIsError(true);
                        isSyncingRef.current = false;
                        setIsSyncing(false);

                        if (retryTimerRef.current) {
                            clearTimeout(retryTimerRef.current);
                            retryTimerRef.current = null;
                        }

                        if (retryCountRef.current < 10) {
                            retryCountRef.current += 1;
                            console.warn(`[useChannels] retrying after error, attempt ${retryCountRef.current}/10`);
                            retryTimerRef.current = setTimeout(() => {
                                isSyncingRef.current = false;
                                requestFromNetworkRef.current({ ...currentParamsRef.current, limit: 100 });
                            }, 1000);
                        } else {
                            console.error('[useChannels] chat:mine failed after 10 error retries');
                            setIsLoading(false);
                        }
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

    // 언마운트 시 재시도 타이머 정리
    useEffect(() => {
        return () => {
            if (retryTimerRef.current) {
                clearTimeout(retryTimerRef.current);
            }
        };
    }, []);

    // 포그라운드 복귀 + WebSocket 재연결 완료 시 데이터 재동기화
    // Recovery 시 isSyncingRef를 리셋하여 이전 실패/대기 중인 요청이 retry를 차단하지 않도록 함
    const requestFromNetworkForRecovery = useCallback(() => {
        isSyncingRef.current = false;
        retryCountRef.current = 0;
        requestFromNetwork();
    }, [requestFromNetwork]);
    useConnectionRecoverySync(requestFromNetworkForRecovery, requestFromNetworkForRecovery);

    return {
        channels,
        isLoading,
        isSyncing,
        isError,
        errorMessage,
        refresh: (options?: ClientChatMinePayload) => {
            setIsError(false);
            setErrorMessage(null);
            isSyncingRef.current = false;
            retryCountRef.current = 0;
            requestFromNetwork(options);
        },
        sync: (options?: ClientChatMinePayload) => requestFromNetwork(options),
    };
};
