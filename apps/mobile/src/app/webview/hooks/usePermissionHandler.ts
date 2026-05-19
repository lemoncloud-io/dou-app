import { useCallback } from 'react';
import { useServices } from '../../hooks';
import type { OnRequestPermissionPayload, PermissionStatus, RequestPermission } from '@chatic/app-messages';

export const usePermissionHandler = () => {
    const { permissionService, logService: logger } = useServices();

    const handleRequestPermission = useCallback(
        async (message: RequestPermission): Promise<{ data: OnRequestPermissionPayload }> => {
            const { permission } = message.data;

            try {
                const isGranted = await permissionService.request(permission);
                let status: PermissionStatus = isGranted ? 'GRANTED' : 'DENIED';

                if (!isGranted) {
                    const checkResult = await permissionService.check(permission);
                    status = checkResult ? 'GRANTED' : 'DENIED';
                }

                return {
                    data: {
                        permission,
                        status,
                    },
                };
            } catch (error) {
                logger.error('PERMISSION', 'PermissionHandler error', error);
                return {
                    data: {
                        permission,
                        status: 'UNAVAILABLE',
                    },
                };
            }
        },
        [permissionService, logger]
    );

    return {
        handleRequestPermission,
    };
};
