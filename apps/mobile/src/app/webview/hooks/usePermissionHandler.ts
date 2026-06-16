import { useCallback } from 'react';
import { useServices } from '../../hooks';
import type { PermissionStatus, WebMessageData } from '@chatic/app-messages';

export const usePermissionHandler = () => {
    const { permissionService, logService: logger } = useServices();

    const handleRequestPermission = useCallback(
        async (message: WebMessageData<'RequestPermission'>) => {
            const { permission } = message.data;

            try {
                const isGranted = await permissionService.request(permission);
                let status: PermissionStatus = isGranted ? 'GRANTED' : 'DENIED';

                if (!isGranted) {
                    const checkResult = await permissionService.check(permission);
                    status = checkResult ? 'GRANTED' : 'DENIED';
                }

                return {
                    type: 'OnRequestPermission' as const,
                    success: true,
                    data: {
                        permission,
                        status,
                    },
                };
            } catch (error: any) {
                logger.error('PERMISSION', 'PermissionHandler error', error);
                return {
                    type: 'OnRequestPermission' as const,
                    success: false,
                    error: { code: 'PERMISSION_ERROR', message: error.message },
                };
            }
        },
        [permissionService, logger]
    );

    return {
        handleRequestPermission,
    };
};
