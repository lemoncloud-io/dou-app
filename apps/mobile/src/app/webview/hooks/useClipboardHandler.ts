import { useMemo } from 'react';
import { useServices } from '../../hooks/useServices';
import { createClipboardHandlers } from './clipboardHandlers';

export const useClipboardHandler = () => {
    const { clipboardService, logService: logger } = useServices();
    return useMemo(() => createClipboardHandlers(clipboardService, logger), [clipboardService, logger]);
};
