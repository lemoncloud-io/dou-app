import { runtime } from '@chatic/app-runtime';

/**
 * The accounts that may manage places on a development build without the admin role: the two
 * shared sign-ins the team uses on the development server. Never consulted on a production build.
 */
const DEV_BUILD_MANAGER_EMAILS: readonly string[] = ['developer@lemoncloud.io', 'app@lemoncloud.io'];

/** The fields of the relay account this rule reads. */
export interface PlaceManagerAccount {
    userRole?: string | null;
    email?: string | null;
    /** What the account signs in with. For an email sign-in the relay token carries the address here. */
    loginId?: string | null;
}

/**
 * Whether an account may make, edit and delete places. An admin may; so may an account whose email
 * is in `allowedEmails`, compared without case or surrounding space. The address is taken from
 * `email`, or from `loginId` when the token has no `email`, which is how an email sign-in arrives.
 *
 * `account` is the relay account, not the user of the cloud the session is in: a cloud gives the
 * same person another role, and this answer must not change from one cloud to the next.
 */
export const canManagePlaces = (
    account: PlaceManagerAccount | null | undefined,
    allowedEmails: readonly string[]
): boolean => {
    if (!account) return false;
    if (account.userRole === 'admin') return true;
    const email = (account.email || account.loginId)?.trim().toLowerCase();
    return !!email && allowedEmails.includes(email);
};

/**
 * Whether the bundle was built for LOCAL or DEV, read from the raw build value and not from the
 * config registry. The registry reads an unset or misspelt stage as LOCAL, which is the right
 * default for a developer's machine and the wrong one here: a production build that lost its stage
 * would open the email list. So the value has to name LOCAL or DEV itself.
 */
const isDevelopmentBuild = (): boolean => {
    const stage = String(import.meta.env.VITE_ENV ?? '').toUpperCase();
    return stage === 'LOCAL' || stage === 'DEV';
};

/**
 * {@link canManagePlaces} for the signed-in relay account. The email list applies on LOCAL and DEV
 * builds only: a build whose stage is missing gets the empty list, the same as production.
 *
 * Read per call. The relay account is a synchronous read of the stored token, so a caller that
 * renders on session signals sees a sign-in or an account change without holding a copy.
 */
export const readPlaceManageAccess = (): boolean => {
    const allowedEmails = isDevelopmentBuild() ? DEV_BUILD_MANAGER_EMAILS : [];
    return canManagePlaces(runtime.session.getRelaySessionUser() as PlaceManagerAccount | null, allowedEmails);
};
