import type { WebMessageData } from '@chatic/app-messages';
import type { IClipboardService } from '../../services';
import type { ILogService } from '../../services';

export const createClipboardHandlers = (clipboardService: IClipboardService, logger: ILogService) => {
    const handleCopyToClipboard = async (message: WebMessageData<'CopyToClipboard'>) => {
        const text = message.data.text;

        try {
            await clipboardService.setText(text);
            return {
                type: 'OnCopyToClipboard' as const,
                success: true,
                data: { copied: true },
            };
        } catch (e: any) {
            logger.error('CLIPBOARD', 'CopyToClipboard error', e);
            return {
                type: 'OnCopyToClipboard' as const,
                success: false,
                error: { code: 'CLIPBOARD_WRITE_ERROR', message: e?.message ?? 'Failed to copy text.' },
            };
        }
    };

    return {
        handleCopyToClipboard,
    };
};
