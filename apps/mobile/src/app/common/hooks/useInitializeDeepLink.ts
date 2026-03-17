import { useEffect } from 'react';
import type { DeepLinkSource, ServiceEndpoints } from '@chatic/deeplinks';
import { getDeepLinkManager } from '@chatic/deeplinks';
import { useDeepLinkStore } from '../stores';
import { logger } from '../services';

/**
 * 앱 전역에서 딥링크 수신을 초기화하고 관리하는 Hook
 * 딥링크를 통해 앱이 열리거나, 포그라운드 상태에서 수신될 때 이를 감지합니다.
 * 수신된 정보를 전역 상태(useDeepLinkStore)에 저장하여,
 * 실제 라우팅이나 웹뷰 처리를 담당하는 컴포넌트가 이를 소비합니다.
 */
export const useInitializeDeepLink = () => {
    useEffect(() => {
        const manager = getDeepLinkManager();

        // 딥링크 수신 시 실행될 콜백 등록 및 리스너 초기화
        manager.initialize({
            handleDeepLink: (url: string, source: DeepLinkSource, envs?: ServiceEndpoints) => {
                logger.info('DEEPLINK', `[App] Deep link received: url, 'source:', source, 'envs:', envs`);

                /**
                 * 수신된 딥링크 정보를 Zustand 전역 스토어에 보관
                 * 이후 웹뷰가 로드 완료되면 해당 상태를 읽어가서 URL 이동 및 스토리지 처리를 수행함
                 */
                useDeepLinkStore.getState().setPendingUrl(url, source, envs);
            },
        });

        return () => {
            manager.cleanup();
        };
    }, []);
};
