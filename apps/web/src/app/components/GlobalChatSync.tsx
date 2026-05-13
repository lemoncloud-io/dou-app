import { useEffect, useState } from 'react';

import type { DomainChannel } from '@chatic/data';

import { useRepositories } from '../shared/data';
import { useChatSync } from '../shared/hooks/useChatSync';

/**
 * 전역 ChatSync 컴포넌트.
 * App 레벨에서 마운트되어 페이지 이동과 무관하게 동기화를 유지합니다.
 * 채널 캐시를 직접 구독하여 모든 채널의 chatNo gap을 감지합니다.
 */
export const GlobalChatSync = () => {
    const { channel: channelRepository } = useRepositories();
    const [channels, setChannels] = useState<DomainChannel[]>([]);

    useEffect(() => {
        const unsub = channelRepository.subscribeList({}, result => {
            if (result) {
                setChannels(result.list);
            }
        });
        return () => unsub();
    }, [channelRepository]);

    useChatSync(channels);

    return null;
};
