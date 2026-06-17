import { useEffect } from 'react';

import { logger } from '@chatic/bridges';
import { cloudCore, useUserContext, useWebCoreStore, webCore } from '@chatic/web-core';

import { useDataProvider, useRepositories } from '../data';
import { useCloudSession, useCloudTokenRefresh, useDynamicDeviceId } from '../hooks';
import { getSocketManager } from '../socket';

export const WebSocketV2Connection = () => {
    const { deviceId } = useDynamicDeviceId();
    const { isPending } = useCloudSession();
    const { currentWSS, endpoints } = useUserContext();
    const socketManager = getSocketManager();
    const { setSelectedCloudId, setSelectedPlaceId, selectedPlaceId, profile } = useWebCoreStore();
    const { device: deviceRepository, auth: authRepository } = useRepositories();
    const { setDataContext } = useDataProvider();

    // 현재 WSS 타입에 따라 endpoint 결정
    const endpoint = currentWSS === 'cloud' ? endpoints.cloudWSS : endpoints.relayWSS;

    // cloudId 설정 (cloud WSS 사용 시만 실제 cloudId, 아니면 'default')
    const selectedCloudId = currentWSS === 'cloud' ? cloudCore.getSelectedCloudId() || 'default' : 'default';

    // 소켓 스코프 = cid/sid/uid. 셋 중 하나라도 바뀌면 소켓을 끊고 재연결한다.
    const sid = selectedPlaceId || undefined;
    const uid = (profile?.uid as string | undefined) ?? undefined;

    useEffect(() => {
        setSelectedCloudId(selectedCloudId);
    }, [selectedCloudId]);

    // selectedPlaceId 복원: cloudCore(영속)에 저장된 값을 Zustand store에 즉시 동기화
    // — 캐시 기반 채널 목록을 바로 표시하기 위함 (서버 fetch는 isVerified 후에만 실행)
    const persistedPlaceId = cloudCore.getSelectedPlaceId();

    useEffect(() => {
        if (persistedPlaceId) {
            setSelectedPlaceId(persistedPlaceId);
        }
    }, [persistedPlaceId]);

    useEffect(() => {
        if (!deviceId || isPending || !endpoint) return;

        // 스코프 전환 원자화: 소켓 재연결 직전에 DataProvider 컨텍스트(cid/sid/uid)를
        // 먼저 동기적으로 교체한다. 컨텍스트 교체와 소켓 재연결이 분리/순차로 일어나면
        // 비동기 응답이 잘못된 스코프에 귀속될 수 있으므로 한 시퀀스로 묶는다.
        setDataContext({ cid: selectedCloudId, sid, uid });

        socketManager.ensure(
            {
                url: endpoint,
                deviceId,
                wssType: currentWSS,
            },
            { cid: selectedCloudId, sid: sid ?? null, uid: uid ?? null }
        );

        const bootstrap = async () => {
            try {
                await socketManager.connect();

                await deviceRepository.saveDevice({
                    id: deviceId,
                    platform: 'web',
                });

                const token =
                    currentWSS === 'cloud'
                        ? (cloudCore.getIdentityToken() ??
                          (await webCore.getTokenSignature()).originToken?.identityToken)
                        : (await webCore.getTokenSignature()).originToken?.identityToken;

                if (token) {
                    await authRepository.updateSocketAuth({ token });
                }
            } catch (error) {
                logger.error('SOCKET', '[WebSocketV2Connection] Failed to bootstrap data socket client', {
                    error,
                    data: { cloudId: selectedCloudId, wssType: currentWSS },
                });
            }
        };

        void bootstrap();
    }, [
        socketManager,
        selectedCloudId,
        sid,
        uid,
        deviceId,
        isPending,
        endpoint,
        currentWSS,
        deviceRepository,
        authRepository,
        setDataContext,
    ]);

    useCloudTokenRefresh();

    return null;
};
