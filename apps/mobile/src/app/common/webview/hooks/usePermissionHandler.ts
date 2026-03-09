import { useCallback } from 'react';
import { PermissionService, Logger } from '../../services';
import type { WebViewBridge } from './useBaseBridge';
import type { AppMessageData, PermissionStatus, RequestPermission } from '@chatic/app-messages';

export const usePermissionHandler = (bridge: WebViewBridge) => {
    const handleRequestPermission = useCallback(
        async (data: RequestPermission['data']) => {
            const { permission } = data;

            try {
                const isGranted = await PermissionService.request(permission);
                let status: PermissionStatus = isGranted ? 'GRANTED' : 'DENIED';

                if (!isGranted) {
                    const checkResult = await PermissionService.check(permission);
                    status = checkResult ? 'GRANTED' : 'DENIED';
                }

                const response: AppMessageData<'OnRequestPermission'> = {
                    type: 'OnRequestPermission',
                    data: {
                        permission,
                        success: isGranted,
                        status,
                    },
                };
                bridge.post(response);
            } catch (error) {
                Logger.error('PERMISSION', 'PermissionHandler error', error);
                const response: AppMessageData<'OnRequestPermission'> = {
                    type: 'OnRequestPermission',
                    data: {
                        permission,
                        success: false,
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
