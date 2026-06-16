import { useCallback, useEffect, useRef, useState } from 'react';

import type { DomainChannel } from '@chatic/data';

import { useWebCoreStore } from '@chatic/web-core';

import { useRepositories } from '../shared/data';
import { useChatSync } from '../shared/hooks/useChatSync';

const MIN_HIDDEN_MS = 5_000;

/**
 * 전역 ChatSync 컴포넌트.
 * App 레벨에서 마운트되어 페이지 이동과 무관하게 동기화를 유지합니다.
 * 채널 캐시를 직접 구독하여 모든 채널의 chatNo gap을 감지합니다.
 */
export const GlobalChatSync = () => {
    const { channel: channelRepository } = useRepositories();
    const [channels, setChannels] = useState<DomainChannel[]>([]);

    // place 전환 시 구독을 재생성하여 새 place의 채널도 sync 대상에 포함
    // channelRepository.subscribeList()가 호출 시점의 DataContext(sid 포함)를 캡처하므로
    // selectedPlaceId가 변경되면 구독을 재생성해야 새 place의 채널이 반환됨
    const selectedPlaceId = useWebCoreStore(s => s.selectedPlaceId);

    useEffect(() => {
        setChannels([]);
        const unsub = channelRepository.subscribeList({}, result => {
            if (result) {
                setChannels(result.list);
            }
        });
        return () => unsub();
    }, [channelRepository, selectedPlaceId]);

    // 서버에서 채널 목록을 가져와 channels state에 직접 반영하는 헬퍼
    // subscribeList 콜백에 의존하지 않고 결과를 직접 setChannels로 반영
    const fetchAndApply = useCallback(
        async (cachePolicy: 'cache-only' | 'network-only') => {
            const sid = selectedPlaceId || undefined;
            try {
                const result = await channelRepository.fetchChannel({ sid }, { cachePolicy });
                if (result?.list?.length) {
                    setChannels(result.list);
                }
            } catch {
                // 캐시/네트워크 실패 무시
            }
        },
        [channelRepository]
    );

    // 포그라운드 복귀 시 채널 리스트 갱신
    // 1) 캐시에서 즉시 읽어 channels 반영 → useChatSync가 gap 감지
    // 2) 소켓 연결 상태면 서버에서도 가져옴
    const hiddenAtRef = useRef<number | null>(null);
    useEffect(() => {
        const handler = () => {
            if (document.visibilityState === 'hidden') {
                hiddenAtRef.current = Date.now();
                return;
            }
            if (document.visibilityState !== 'visible' || !hiddenAtRef.current) return;

            const elapsed = Date.now() - hiddenAtRef.current;
            hiddenAtRef.current = null;
            if (elapsed < MIN_HIDDEN_MS) return;

            void fetchAndApply('cache-only');

            if (selectedPlaceId) {
                void fetchAndApply('network-only');
            }
        };
        document.addEventListener('visibilitychange', handler);
        return () => document.removeEventListener('visibilitychange', handler);
    }, [fetchAndApply, selectedPlaceId]);

    useChatSync(channels);

    return null;
};
