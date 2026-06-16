import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { cloudCore, reportError, toError, useServiceStatusStore, useWebCoreStore, webCore } from '@chatic/web-core';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { getSocketManager, useSocketState } from '../socket';

const REFRESH_INTERVAL_MS = 60_000;

const isServerError = (error: unknown): boolean => {
    const err = error as any;
    const status = err?.status || err?.response?.status || err?.statusCode;
    return status >= 500 && status < 600;
};

const isAuthError = (error: unknown): boolean => {
    const err = error as any;
    const status = err?.status || err?.response?.status || err?.statusCode;
    const message = String(err?.message || err?.data?.message || '');
    return (
        (typeof status === 'number' && status >= 400 && status < 500) ||
        message.includes('INVALID_TOKEN') ||
        message.includes('Token validation failed') ||
        message.includes('signature timeout')
    );
};

export const useCloudTokenRefresh = () => {
    const { t } = useTranslation();
    const { isAuthenticated, setSelectedCloudId, setSelectedPlaceId } = useWebCoreStore();
    const { setServiceUnavailable } = useServiceStatusStore();
    const { toast } = useToast();
    const wssType = useSocketState(s => s.wssType);
    const isConnected = useSocketState(s => s.isConnected);
    const refreshingRef = useRef(false);

    useEffect(() => {
        if (!isConnected || !isAuthenticated) return;

        const refresh = async () => {
            if (refreshingRef.current) return;
            refreshingRef.current = true;
            try {
                const client = getSocketManager().getActiveClient();
                if (!client) return;
                if (wssType !== 'cloud') {
                    const token = (await webCore.getTokenSignature()).originToken?.identityToken;
                    if (token) await client.request('auth.update' as any, { token });
                    return;
                }

                try {
                    await cloudCore.refreshToken();
                    setServiceUnavailable(false);
                } catch (e) {
                    logger.error('AUTH', '[CloudTokenRefresh] refreshToken failed', { error: e });
                    reportError(toError(e));
                    if (isServerError(e)) {
                        setServiceUnavailable(true);
                        return;
                    }
                    if (isAuthError(e)) {
                        // cloud 토큰 만료/무효 → 기본 클라우드(relay)로 fallback
                        logger.warn('AUTH', '[CloudTokenRefresh] Cloud token expired, falling back to default cloud');
                        cloudCore.clearDelegationToken();
                        cloudCore.clearSelectedPlace();
                        setSelectedCloudId('default');
                        setSelectedPlaceId(null);
                        toast({ title: t('cloudSessionSheet.cloudSessionExpired'), variant: 'destructive' });
                        return;
                    }
                }

                const token = cloudCore.getIdentityToken();
                if (token) {
                    await client.request('auth.update' as any, { token });
                }
            } finally {
                refreshingRef.current = false;
            }
        };

        const id = setInterval(() => {
            void refresh();
        }, REFRESH_INTERVAL_MS);

        return () => clearInterval(id);
    }, [wssType, isAuthenticated, isConnected, setServiceUnavailable, toast, t]);
};
