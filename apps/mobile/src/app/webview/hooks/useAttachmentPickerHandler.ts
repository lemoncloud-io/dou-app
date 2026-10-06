import { useMemo } from 'react';
import { AttachmentPickerBridge } from '../../bridge';
import { useServices } from '../../hooks/useServices';
import { createAttachmentPickerHandlers } from './attachmentPickerHandlers';

export const useAttachmentPickerHandler = () => {
    const { logService: logger } = useServices();
    return useMemo(
        () => ({
            isAvailable: AttachmentPickerBridge.isAvailable,
            canReadVideoFrame: AttachmentPickerBridge.canReadVideoFrame,
            ...createAttachmentPickerHandlers(AttachmentPickerBridge, logger),
        }),
        [logger]
    );
};
