import { runtime } from '@chatic/runtime-react';

const DEV_BUILD_MANAGER_EMAILS: readonly string[] = ['developer@lemoncloud.io', 'app@lemoncloud.io'];

export interface PlaceManagerAccount {
    userRole?: string | null;
    email?: string | null;
    loginId?: string | null;
}

export const canManagePlaces = (
    account: PlaceManagerAccount | null | undefined,
    allowedEmails: readonly string[]
): boolean => {
    if (!account) return false;
    if (account.userRole === 'admin') return true;
    const email = (account.email || account.loginId)?.trim().toLowerCase();
    return !!email && allowedEmails.includes(email);
};

const isDevelopmentBuild = (): boolean => {
    const stage = String(import.meta.env.VITE_ENV ?? '').toUpperCase();
    return stage === 'LOCAL' || stage === 'DEV';
};

export const readPlaceManageAccess = (): boolean => {
    const allowedEmails = isDevelopmentBuild() ? DEV_BUILD_MANAGER_EMAILS : [];
    return canManagePlaces(runtime.session.getRelaySessionUser() as PlaceManagerAccount | null, allowedEmails);
};
