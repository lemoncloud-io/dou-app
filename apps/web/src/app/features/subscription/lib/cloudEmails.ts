import type { CloudView } from '@lemoncloud/chatic-backend-api';

export const normalizeEmail = (value?: string | null): string => (value ?? '').trim().toLowerCase();

/**
 * Finds the cloud already holding an address, if any.
 *
 * Every cloud needs its own email because the backend records exactly one `verify$.cloudId` on the
 * email account record and `release` walks that single pointer to unwind the cascade. Verifying the
 * same address a second time throws no error — it overwrites the first pointer and leaves the
 * earlier cloud's teardown pointing at the wrong place. So the app refuses at input time instead of
 * sending a code and failing afterwards.
 *
 * Released clouds are `expired` and dropped from the list the server returns, which matches the
 * backend state: their pointer is gone, so the address is genuinely reusable.
 */
export const findCloudByEmail = (clouds: CloudView[], email: string): CloudView | undefined => {
    const target = normalizeEmail(email);
    if (!target) return undefined;
    return clouds.find(c => c.status !== 'expired' && normalizeEmail(c.email) === target);
};
