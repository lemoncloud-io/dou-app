import { useEffect } from 'react';
import { useWebSocketV2Store } from '@chatic/socket';
import { useUserRepository } from '../repository';
import type { UserView } from '@lemoncloud/chatic-socials-api';
import { useWebCoreStore } from '@chatic/web-core';

/**
 * 앱 최상단에서 동작하며, User 및 Channel Member 관련 웹소켓 응답을 백그라운드에서 수신
 * 로컬 IndexedDB와 동기화하고 전역 갱신 이벤트를 방출하는 Sync hook
 */
export const useUserCacheSync = () => {
    const userRepository = useUserRepository();

    useEffect(() => {
        const unsubscribe = useWebSocketV2Store.subscribe(
            state => state.lastMessage,
            async (envelope: any) => {
                if (!envelope || !['user', 'chat'].includes(envelope.type)) return;

                // 현재 활성화된 클라우드 환경인지 검증
                const cloudId = useWebSocketV2Store.getState().cloudId;
                if (!cloudId || userRepository.cloudId !== cloudId) return;

                const { type, action, payload } = envelope;
                let isDbUpdated = false;
                let targetChannelId: string | undefined;

                if (type === 'user') {
                    switch (action) {
                        case 'update-profile': {
                            const updatedUser = payload as UserView;
                            if (updatedUser?.id) {
                                await userRepository.saveUser(updatedUser);
                                const currentProfile = useWebCoreStore.getState().profile;
                                if (currentProfile && currentProfile.$user?.id === updatedUser.id) {
                                    useWebCoreStore.getState().setProfile({
                                        ...currentProfile,
                                        $user: { ...currentProfile.$user, ...updatedUser },
                                    } as any);
                                }
                                isDbUpdated = true;
                            }
                            break;
                        }
                    }
                } else if (type === 'chat' && action === 'users') {

                /**
                 *  채팅방 멤버 목록 수신 시 유저 로컬 DB에 일괄 저장
                 *  targetChannelId는 `useChannelMembers` 훅 갱신을 위해 사용
                 */
                    const userList = payload?.list as UserView[];
                    targetChannelId = payload?.targetChannelId;

                    if (userList && userList.length > 0) {
                        await userRepository.saveUsers(userList);
                        isDbUpdated = true;
                    }
                }

                // DB 갱신이 발생한 경우에만 전역 이벤트 방출하여 UI 컴포넌트 리렌더링 유도
                if (isDbUpdated) {
                    notifyUserDbUpdated({
                        domain: 'user',
                        cid: cloudId,
                        targetChannelId: targetChannelId,
                    });
                }
            }
        );

        return () => unsubscribe();
    }, [userRepository]);
};

/**
 * DB 갱신 사실을 현재 탭과 다른 브라우저 탭 모두에 알리는
 */
export const notifyUserDbUpdated = (detail: { domain: 'user'; cid: string; targetChannelId?: string }) => {
    window.dispatchEvent(new CustomEvent('local-db-updated', { detail }));
    const bc = new BroadcastChannel('app-db-sync');
    bc.postMessage(detail);
    bc.close();
};
