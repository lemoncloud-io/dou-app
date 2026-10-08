import { config } from '@chatic/config';
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
}

/**
 * Whether an account may make, edit and delete places. An admin may; so may an account whose email
 * is in `allowedEmails`, compared without case or surrounding space.
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
    const email = account.email?.trim().toLowerCase();
    return !!email && allowedEmails.includes(email);
};

/**
 * {@link canManagePlaces} for the signed-in relay account. The email list applies on LOCAL and DEV
 * builds only, read off the stage baked into the bundle: a build whose stage is not known yet
 * gets the empty list, the same as production.
 *
 * Read per call. The relay account is a synchronous read of the stored token, so a caller that
 * renders on session signals sees a sign-in or an account change without holding a copy.
 */
export const readPlaceManageAccess = (): boolean => {
    const buildStage = config.get<string>('env.buildStage');
    const allowedEmails = buildStage === 'LOCAL' || buildStage === 'DEV' ? DEV_BUILD_MANAGER_EMAILS : [];
    return canManagePlaces(runtime.session.getRelaySessionUser() as PlaceManagerAccount | null, allowedEmails);
};
