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

/**
 * Every owned cloud still missing its email.
 *
 * `POST /clouds/0/make` (and the `make` a purchase enqueues) never required an email — the backend
 * confirmed a cloud goes all the way to `active` without one, and an address can be bound to it
 * later via `verify-email`'s `confirm` step (see `cloudId` on {@link EmailVerifyDialog}). A skipped
 * email step leaves exactly this: a cloud that exists and counts against the quota but has nothing
 * to sign into it with — and, more to the point, nothing to recover it with on a new device.
 *
 * All of them, not just the first: with several clouds on a higher tier, naming only one leaves the
 * user fixing that one and being told again that "a cloud" needs an email. Oldest first, since that
 * is the one that has gone longest without one.
 */
export const findUnboundClouds = (clouds: CloudView[]): CloudView[] =>
    clouds.filter(isUnboundCloud).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

/**
 * One cloud's side of {@link findUnboundClouds} — for screens that already hold a row and only need
 * to know whether THIS cloud is missing its email (`CloudManagePage`).
 *
 * NOT the same rule as home's `needsEmailBind`, which also requires `active`: the switcher row for a
 * cloud still being provisioned already says what is happening, so it must not also offer an email
 * prompt. Here every unreleased cloud is listed, provisioning included, and the address can be
 * bound while the cloud is still coming up.
 */
export const isUnboundCloud = (cloud: CloudView): boolean => cloud.status !== 'expired' && !cloud.email;

/**
 * How an unbound cloud is named in a list. It has no email to fall back on — that is the whole
 * point of it being listed — so an unnamed cloud shows its id rather than an empty bullet.
 */
export const unboundCloudLabel = (cloud: CloudView): string => cloud.name?.trim() || (cloud.id ?? '');
