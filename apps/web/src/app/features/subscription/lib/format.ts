import type { CloudView, MembershipView } from '@lemoncloud/chatic-backend-api';

import { isWebBilled } from './webCheckout';

export const formatDate = (timestamp?: number | null): string => {
    if (!timestamp || timestamp <= 0) return '-';
    const d = new Date(timestamp);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

export const platformLabelKey = (platform: MembershipView['platform'] | string | undefined): string | undefined => {
    if (platform === 'apple') return 'mypage.subscription.platformApple';
    if (platform === 'google') return 'mypage.subscription.platformGoogle';
    return isWebBilled(platform) ? 'mypage.subscription.platformWeb' : undefined;
};

export const cloudDisplayName = (cloud: CloudView): string =>
    cloud.name || cloud.email?.split('@')[0] || cloud.id || '-';
