import { useMemo } from 'react';
import { ShareIntakeBridge } from '../../bridge';
import { useServices } from '../../hooks/useServices';
import { createShareIntakeHandlers } from './shareIntakeHandlers';

export const useShareIntakeHandler = () => {
    const { logService: logger } = useServices();
    return useMemo(
        () => ({
            isAvailable: ShareIntakeBridge.isAvailable,
            ...createShareIntakeHandlers(ShareIntakeBridge, logger),
        }),
        [logger]
    );
};
