import { useEffect, useMemo, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import type { DomainChannel, DomainChat } from '@chatic/data';

/**
 * 홈 채널 목록 전체의 "마지막 메시지 프리뷰" — 행별 `useLastChat`의 리스트 레벨 대체 (ADR-0057).
 *
 * 순수 캐시 관측이다: 채널마다 30행 윈도우를 구독하는 대신 `chat.observeLastList` 하나로
 * 읽는다(신버전 앱은 목록 전체가 브릿지 왕복 1회, 구버전 앱·브라우저는 데이터소스가 채널별
 * 윈도우로 폴백). **네트워크는 여기서 만들지 않는다** — 최근 메시지를 캐시에 적재하는 일은
 * 이 화면 밖에서 따로 관리되고(네이티브의 백그라운드 메시지 적재), 그 쓰기가 `chats-last`
 * 리이밋으로 이 관측을 다시 깨운다. 목록은 캐시가 말하는 마지막 메시지를 그대로 비출 뿐이다.
 */
export const useLastChats = (channels: DomainChannel[]): Map<string, DomainChat> => {
    const { chat: chatRepository } = useRuntimeRepositories();

    const [lastByChannel, setLastByChannel] = useState<Map<string, DomainChat>>(new Map());

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
        if (!channelKey) {
            setLastByChannel(new Map());
            return;
        }
        const channelIds = channelKey.split(',');
        return chatRepository.observeLastList(channelIds, rows => {
            const nextLast = new Map<string, DomainChat>();
            for (const row of rows) {
                if (row.chat) nextLast.set(row.channelId, row.chat);
            }
            setLastByChannel(nextLast);
        });
    }, [chatRepository, channelKey]);

    return lastByChannel;
};
