import { isNative, logger } from '@chatic/bridges';

import { appBridge } from '../../../bridge';
import { copyMessageToClipboard } from '../../channels/utils/copyMessageToClipboard';

/** Which channel actually carried the invite text, so the caller can toast accordingly. */
export type InviteMessageChannel = 'sms' | 'clipboard';

/**
 * Deliver an invite message to `phone`: opens the native SMS composer prefilled with `body` when
 * running in the app, falling back to a clipboard copy otherwise — including when the composer
 * bridge rejects (no native bridge) or reports it could not open (ADR-0089 D4).
 *
 * Never rejects: a clipboard failure (e.g. no Clipboard API) surfaces as `false`, which callers
 * treat as the invite still being issued, just without an automatic hand-off.
 */
export const sendInviteMessage = async (phone: string, body: string): Promise<InviteMessageChannel | false> => {
    if (isNative()) {
        try {
            const response = await appBridge.sendSms(phone, body);
            // Only an explicit `false` means the composer did not open. Shells up to 0.28.4 send no
            // `data` at all and answer a composer that could not open with a failed reply, which
            // rejects above — so a resolved reply from them is an opened composer. Requiring
            // `data.success` read every one of those as a failure and copied over the user's
            // clipboard on top of the composer it had just opened.
            if (response.data?.success !== false) return 'sms';
        } catch (error) {
            logger.error('INVITE', 'SendSms bridge request failed, falling back to clipboard', { error });
        }
    }

    // The browser path of `copyMessageToClipboard` rejects rather than answering false — a missing
    // Clipboard API, or a denied write permission (`NotAllowedError`). Caught here because by now the
    // invite already exists: letting it escape made every caller report an issued invite as a failed
    // one, inviting a retry that issues a second.
    try {
        const copied = await copyMessageToClipboard(body);
        return copied ? 'clipboard' : false;
    } catch (error) {
        logger.error('INVITE', 'Clipboard copy of the invite message failed', { error });
        return false;
    }
};
