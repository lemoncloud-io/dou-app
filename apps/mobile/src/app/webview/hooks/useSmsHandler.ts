import { useMemo } from 'react';
import { useServices } from '../../hooks';
import { createSmsHandlers } from './smsHandlers';

export const useSmsHandler = () => {
    const { smsService, logService: logger } = useServices();
    return useMemo(() => createSmsHandlers(smsService, logger), [smsService, logger]);
};
