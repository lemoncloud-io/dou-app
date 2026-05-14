import { useCallback } from 'react';
import { permissionService, logger } from '../../services';
import type { WebViewBridge } from './useBaseBridge';
import type { AppMessageData, PermissionStatus, RequestPermission } from '@chatic/app-messages';

export const usePermissionHandler = (bridge: WebViewBridge) => {
    const handleRequestPermission = useCallback(
        async (data: RequestPermission['data']) => {
            const { permission } = data;

            try {
                const isGranted = await permissionService.request(permission);
                let status: PermissionStatus = isGranted ? 'GRANTED' : 'DENIED';

                if (!isGranted) {
                    const checkResult = await permissionService.check(permission);
                    status = checkResult ? 'GRANTED' : 'DENIED';
                }

                const response: AppMessageData<'OnRequestPermission'> = {
                    type: 'OnRequestPermission',
                    data: {
                        permission,
                        status,
                    },
                };
                bridge.post(response);
            } catch (error) {
                logger.error('PERMISSION', 'PermissionHandler error', error);
                const response: AppMessageData<'OnRequestPermission'> = {
                    type: 'OnRequestPermission',
                    data: {
                        permission,
                        status: 'UNAVAILABLE',
                    },
                };
                bridge.post(response);
            }
        },
        [bridge]
    );

    return {
        handleRequestPermission,
    };
};
