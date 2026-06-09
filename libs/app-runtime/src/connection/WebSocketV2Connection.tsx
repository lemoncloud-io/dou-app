import { useEffect } from 'react';

import { forceReconnect, useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import { cloudCore, useUserContext } from '@chatic/web-core';

import { useDynamicDeviceId } from '../hooks/useDynamicDeviceId';
import { useCloudTokenRefresh } from '../hooks/useCloudTokenRefresh';
import { useCloudSession } from '../hooks/useCloudSession';

export const WebSocketV2Connection = () => {
    const { deviceId } = useDynamicDeviceId();
    const { isPending } = useCloudSession();
    const { currentWSS, endpoints } = useUserContext();
    // cloudId 구독: cloud 토큰 만료 fallback 시 re-render 트리거 → currentWSS 재평가 → endpoint 변경
    useWebSocketV2Store(s => s.cloudId);

    // 현재 WSS 타입에 따라 endpoint 결정
    const endpoint = currentWSS === 'cloud' ? endpoints.cloudWSS : endpoints.relayWSS;

    // cloudId 설정 (cloud WSS 사용 시만 실제 cloudId, 아니면 'default')
    const selectedCloudId = currentWSS === 'cloud' ? cloudCore.getSelectedCloudId() || 'default' : 'default';

    useEffect(() => {
        useWebSocketV2Store.getState().setCloudId(selectedCloudId);
    }, [selectedCloudId]);

    // selectedPlaceId 복원: cloudCore(영속)에 저장된 값을 Zustand store에 즉시 동기화
    // — 캐시 기반 채널 목록을 바로 표시하기 위함 (서버 fetch는 isVerified 후에만 실행)
    const persistedPlaceId = cloudCore.getSelectedPlaceId();

    useEffect(() => {
        if (persistedPlaceId && !useWebSocketV2Store.getState().selectedPlaceId) {
            useWebSocketV2Store.getState().setSelectedPlaceId(persistedPlaceId);
        }
    }, [persistedPlaceId]);

    // NOTE: Socket connection runs entirely in the background. We never block the
    // UI on `connectionStatus` / `isVerified` — previous implementation toggled a
    // global loader during connecting/verifying which made the app feel like it
    // was waiting on the socket. Per product rule: "소켓연결은 무조건 기다리면 안돼".
    useWebSocketV2({
        endpoint,
        connectParams: { deviceId },
        enabled: !!deviceId && !isPending && !!endpoint,
        wssType: currentWSS,
    });

    useCloudTokenRefresh();

    // Force an immediate reconnect on network-restore and after OS sleep, instead
    // of waiting out the package's backoff. After sleep no `visibilitychange`
    // fires (the page stayed "visible"), so we detect resume via a wall-clock gap:
    // if a timer tick lands far later than scheduled, timers were frozen → wake.
    // forceReconnect no-ops when the socket is already healthy.
    useEffect(() => {
        const onOnline = () => forceReconnect();
        window.addEventListener('online', onOnline);

        const TICK_MS = 30_000;
        const GAP_MS = 70_000; // > 2 ticks ⇒ frozen timers (sleep), not normal jitter
        let last = Date.now();
        const timer = window.setInterval(() => {
            const now = Date.now();
            if (now - last > GAP_MS) forceReconnect();
            last = now;
        }, TICK_MS);

        return () => {
            window.removeEventListener('online', onOnline);
            window.clearInterval(timer);
        };
    }, []);

    return null;
};
