import { useEffect, useMemo, useRef, useState } from 'react';

import { useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';
import type { DomainChannel, DomainChat } from '@chatic/data';

// 채널 하나의 head-트리거 refresh가 끌어오는 페이지 크기. 최신 행들이 프리뷰 불가(리액션
// burst)여도 진짜 메시지까지 닿을 깊이 — 폴백 윈도우(LAST_CHAT_FALLBACK_LOOKBACK)와 같은 근거.
const HEAD_REFRESH_LIMIT = 30;

/**
 * 홈 채널 목록 전체의 "마지막 메시지 프리뷰" — 행별 `useLastChat`의 리스트 레벨 대체 (ADR-0057).
 *
 * 채널마다 30행 윈도우를 구독하는 대신 `chat.observeLastList` 하나로 관측한다: 신버전 앱에서는
 * 목록 전체가 브릿지 왕복 1회(`FetchLastChatsData`), 구버전 앱·브라우저에서는 데이터소스가
 * 채널별 윈도우 조회로 폴백하므로 동작은 오늘과 같다. 행별 chat sync 타깃도 등록하지 않는다 —
 * 홈은 chat push의 수신 대상이 아니고(뷰잉 룸 스코프), 신선도는 아래 head-트리거가 담당한다.
 *
 * head-트리거: 행별 채널 폴링(useChannelSync)이 올린 `channel.chatNo`가 관측 결과의 `lastNo`
 * (그 채널 캐시의 타입 무관 최대 chatNo)를 넘어서면 그 채널만 최신 페이지를 당겨온다. 비교
 * 기준이 "이미 손에 든 관측 결과"라서, 구 `useLastChat`이 갖던 초기화 레이스 — 캐시 최댓값이
 * 느린 브릿지 읽기로 채워지기 전에 head가 도착해 warm 캐시에도 fetch를 쏘던 결함 — 가
 * 구조적으로 없다: 첫 관측 결과가 오기 전에는 트리거 자체가 잠겨 있다.
 */
export const useLastChats = (channels: DomainChannel[]): Map<string, DomainChat> => {
    const { chat: chatRepository } = useRuntimeRepositories();
    const { isVerified } = useRuntimeSocketState();

    const [lastByChannel, setLastByChannel] = useState<Map<string, DomainChat>>(new Map());

    // 관측 결과의 채널별 lastNo — head-트리거의 비교 기준. 첫 결과 수신 전에는 undefined로
    // 남아 트리거를 잠근다(ready 플래그를 겸한다). ref인 이유: 이 값의 갱신 자체는 리렌더를
    // 만들 필요가 없고, 트리거 effect는 lastByChannel/channels 갱신으로 이미 다시 돈다.
    const lastNoByChannelRef = useRef<Map<string, number> | null>(null);
    // 채널별로 이미 refresh를 발사한 head 값 — 같은 head가 fetch를 두 번 만들지 못하게 한다.
    // 응답이 lastNo를 못 올리는 경우(최신 행이 전부 답글/리액션)에도 재발사를 막는 안전판.
    const requestedNoRef = useRef(new Map<string, number>());

    // 정렬해 합친 키: 정렬(핀/최근) 변화로 순서만 바뀐 동일 집합이 재구독을 만들지 않게 한다.
    const channelKey = useMemo(
        () =>
            channels
                .map(channel => channel.id)
                .filter(Boolean)
                .sort()
                .join(','),
        [channels]
    );

    useEffect(() => {
        lastNoByChannelRef.current = null;
        if (!channelKey) {
            setLastByChannel(new Map());
            return;
        }
        const channelIds = channelKey.split(',');
        return chatRepository.observeLastList(channelIds, rows => {
            const nextLast = new Map<string, DomainChat>();
            const nextNos = new Map<string, number>();
            for (const row of rows) {
                nextNos.set(row.channelId, row.lastNo);
                if (row.chat) nextLast.set(row.channelId, row.chat);
            }
            lastNoByChannelRef.current = nextNos;
            setLastByChannel(nextLast);
        });
    }, [chatRepository, channelKey]);

    // head-트리거: 캐시 lastNo보다 앞선 채널만 골라 최신 페이지를 당긴다. 가져온 페이지는
    // cacheWriteMany → `chats-last` 리이밋 → 위 관측이 새 프리뷰로 다시 방출한다.
    useEffect(() => {
        if (!isVerified) return;
        const lastNos = lastNoByChannelRef.current;
        if (!lastNos) return; // 첫 관측 결과 전 — 비교 기준이 없으면 발사하지 않는다.

        for (const channel of channels) {
            if (!channel.id) continue;
            const head = channel.chatNo ?? 0;
            const known = lastNos.get(channel.id) ?? 0;
            const requested = requestedNoRef.current.get(channel.id) ?? 0;
            if (head > known && head > requested) {
                requestedNoRef.current.set(channel.id, head);
                void chatRepository
                    .refreshList({ channelId: channel.id, limit: HEAD_REFRESH_LIMIT })
                    .catch(() => undefined);
            }
        }
        // lastByChannel: 첫 관측 결과가 lastNoByChannelRef를 채운 직후 이 effect를 다시 돌리는
        // 신호다 — channels가 그대로여도 잠금 해제 시점에 밀린 head를 처리해야 한다.
    }, [channels, lastByChannel, isVerified, chatRepository]);

    return lastByChannel;
};
