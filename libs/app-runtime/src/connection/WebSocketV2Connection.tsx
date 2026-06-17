import { useEffect } from 'react';

import { logger } from '@chatic/bridges';
import { cloudCore, webCore } from '@chatic/web-core';

import { useRepositories } from '../data';
import { useCloudSession, useCloudTokenRefresh } from '../hooks';
import { getSocketManager } from '../socket';
import type { RuntimeBinding } from '../runtime';

export const WebSocketV2Connection = ({ binding }: { binding: RuntimeBinding }) => {
    const { isPending } = useCloudSession();
    const socketManager = getSocketManager();
    const { device: deviceRepository, auth: authRepository } = useRepositories();
    const socketBinding = binding.socket;

    useEffect(() => {
        if (isPending || !socketBinding) return;

        socketManager.ensure(socketBinding.config, socketBinding.scope);

        const bootstrap = async () => {
            try {
                await socketManager.connect();

                await deviceRepository.saveDevice({
                    id: socketBinding.config.deviceId,
                    platform: 'web',
                });

                const token =
                    socketBinding.config.wssType === 'cloud'
                        ? (cloudCore.getIdentityToken() ??
                          (await webCore.getTokenSignature()).originToken?.identityToken)
                        : (await webCore.getTokenSignature()).originToken?.identityToken;

                if (token) {
                    await authRepository.updateSocketAuth({ token });
                }
            } catch (error) {
                logger.error('SOCKET', '[WebSocketV2Connection] Failed to bootstrap data socket client', {
                    error,
                    data: { cloudId: binding.context.cid, wssType: socketBinding.config.wssType },
                });
            }
        };

        void bootstrap();
    }, [socketManager, binding.context.cid, isPending, socketBinding, deviceRepository, authRepository]);

    useCloudTokenRefresh();

    return null;
};
