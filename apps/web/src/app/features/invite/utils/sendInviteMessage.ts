import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/runtime-react';

import { copyMessageToClipboard } from '../../channels/utils/copyMessageToClipboard';

export type InviteMessageChannel = 'sms' | 'clipboard';

export const sendInviteMessage = async (phone: string, body: string): Promise<InviteMessageChannel | false> => {
    const sms = runtime.links.sms;
    if (sms) {
        try {
            const answer = await sms.compose(phone, body);
            if (answer?.success !== false) return 'sms';
        } catch (error) {
            logger.error('INVITE', 'SendSms bridge request failed, falling back to clipboard', { error });
        }
    }

    try {
        const copied = await copyMessageToClipboard(body);
        return copied ? 'clipboard' : false;
    } catch (error) {
        logger.error('INVITE', 'Clipboard copy of the invite message failed', { error });
        return false;
    }
};
