type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export const composeInviteSmsBody = (t: TranslateFn, senderName: string | undefined, deeplink: string): string =>
    t('contactInvite.smsMessage', {
        senderName: senderName || t('contactInvite.defaultSenderName'),
        deeplink,
    });
