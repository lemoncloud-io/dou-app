import { isNative, logger } from '@chatic/bridges';

import { appBridge } from '../../../bridge';
import { copyMessageToClipboard } from '../../channels/utils/copyMessageToClipboard';

/** Which channel actually carried the invite text, so the caller can toast accordingly. */
export type InviteMessageChannel = 'sms' | 'clipboard';

/**
 * Deliver an invite message to `phone`: opens the native SMS composer prefilled with `body` when
 * running in the app, falling back to a clipboard copy otherwise — including when the composer
 * bridge rejects (no native bridge) or reports it could not open (ADR-0033 D4).
 *
 * Never rejects: a clipboard failure (e.g. no Clipboard API) surfaces as `false`, which callers
 * treat as the invite still being issued, just without an automatic hand-off.
 */
export const sendInviteMessage = async (phone: string, body: string): Promise<InviteMessageChannel | false> => {
    if (isNative()) {
        try {
            const response = await appBridge.sendSms(phone, body);
            if (response.data?.success) return 'sms';
        } catch (error) {
            logger.error('INVITE', 'SendSms bridge request failed, falling back to clipboard', { error });
        }
    }

    const copied = await copyMessageToClipboard(body);
    return copied ? 'clipboard' : false;
};
