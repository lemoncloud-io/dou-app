import Clipboard from '@react-native-clipboard/clipboard';
import type { Logger } from '@chatic/logger';
import type { IClipboardService } from './types';

export class ClipboardService implements IClipboardService {
    constructor(private readonly logger: Logger) {}

    async setText(text: string): Promise<void> {
        try {
            Clipboard.setString(text);
        } catch (error) {
            this.logger.error('CLIPBOARD', 'Failed to write clipboard text', error);
            throw error;
        }
    }
}
