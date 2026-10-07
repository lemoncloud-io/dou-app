import type { CloudView, MembershipView } from '@lemoncloud/chatic-backend-api';

/** `YYYY.MM.DD`, or `-` when there is no date — the one date shape every subscription screen prints. */
export const formatDate = (timestamp?: number | null): string => {
    if (!timestamp || timestamp <= 0) return '-';
    const d = new Date(timestamp);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

/** The i18n key naming the store a membership was bought on, or `undefined` when it is unknown. */
export const platformLabelKey = (platform: MembershipView['platform']): string | undefined =>
    platform === 'apple'
        ? 'mypage.subscription.platformApple'
        : platform === 'google'
          ? 'mypage.subscription.platformGoogle'
          : undefined;

/**
 * What a cloud is called on a subscription card: its name, else the local part of its recovery email,
 * else its id. Longer than the row chain in `utils/cloudDisplayName` on purpose — a keep-clouds card
 * must never be blank, where a list row may say so itself.
 */
export const cloudDisplayName = (cloud: CloudView): string =>
    cloud.name || cloud.email?.split('@')[0] || cloud.id || '-';
