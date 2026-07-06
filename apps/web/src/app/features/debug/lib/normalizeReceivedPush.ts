import type { AppMessageData } from '@chatic/app-messages';

/** An inbound push message flattened for display and logging. */
export interface NormalizedPush {
    title: string;
    body: string;
    data: Record<string, unknown>;
    /** Epoch millis when the web received the bridge event. */
    receivedAt: number;
}

const FALLBACK = '(none)';

const toText = (value: string | undefined): string => (typeof value === 'string' ? value.trim() : '') || FALLBACK;

/**
 * Flattens an inbound `OnReceiveNotification` bridge event into a display entry.
 *
 * `receivedAt` is passed in (not read from the clock) so this stays pure and
 * deterministic for tests. Missing title/body degrade to a placeholder.
 */
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
