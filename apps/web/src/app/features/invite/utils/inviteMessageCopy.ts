/** Minimal shape of react-i18next's `t` this module needs — avoids an `i18next` type dependency. */
type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

/**
 * Builds the SMS body handed to `sendInviteMessage` — shared by the first issuance
 * (`ContactInvitePage`) and a waiting-screen reissue, so both read identically.
 */
export const composeInviteSmsBody = (t: TranslateFn, senderName: string | undefined, deeplink: string): string =>
    t('contactInvite.smsMessage', {
        senderName: senderName || t('contactInvite.defaultSenderName'),
        deeplink,
    });
