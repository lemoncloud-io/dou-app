import type { AppMessageData } from '@chatic/bridge-messages';

export interface NormalizedPush {
    title: string;
    body: string;
    data: Record<string, unknown>;
    receivedAt: number;
}

const FALLBACK = '(none)';

const toText = (value: string | undefined): string => (typeof value === 'string' ? value.trim() : '') || FALLBACK;

export const normalizeReceivedPush = (
    message: AppMessageData<'OnReceiveNotification'>,
    receivedAt: number
): NormalizedPush => {
    const notification = message?.data?.notification;

    return {
        title: toText(notification?.title),
        body: toText(notification?.body),
        data: notification?.data ?? {},
        receivedAt,
    };
};
