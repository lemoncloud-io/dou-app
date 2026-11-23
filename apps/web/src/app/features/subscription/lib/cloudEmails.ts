import type { CloudView } from '@lemoncloud/chatic-backend-api';

export const normalizeEmail = (value?: string | null): string => (value ?? '').trim().toLowerCase();

export const findCloudByEmail = (clouds: CloudView[], email: string): CloudView | undefined => {
    const target = normalizeEmail(email);
    if (!target) return undefined;
    return clouds.find(c => c.status !== 'expired' && normalizeEmail(c.email) === target);
};
