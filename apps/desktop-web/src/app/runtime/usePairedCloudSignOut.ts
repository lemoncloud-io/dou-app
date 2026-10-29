import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/app-runtime';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { useAccountResetOnLogout } from '../shared';

/**
 * desktop-web's policy for the clouds a phone approved this browser into.
 *
 * The runtime re-checks each paired cloud through the relay at mount and every ten minutes, and tears
 * down one whose approval ended. Two things are this shell's:
 *
 * - **Coming back to the window checks too.** A browser left in the background would otherwise keep a
 *   revoked cloud on screen until the next ten-minute round; returning to it is when the person looks,
 *   so that is when it is asked again. The runtime skips the call while a check is already running.
 * - **An ended approval signs the browser out.** The approval was the sign-in, and the relay refuses
 *   this auth session's way into that cloud until a new session replaces it. Several clouds ending in
 *   one round sign out once.
 */
export const usePairedCloudSignOut = (): void => {
    const { t } = useTranslation();
    const logout = runtime.session.useSessionLogout();
    const { resetAccount } = useAccountResetOnLogout();
    const signingOut = useRef(false);

    const { check } = runtime.session.usePairedCloudCheck(() => {
        toast({ title: t('pairing.cloud.ended') });
        if (signingOut.current) return;
        signingOut.current = true;
        void resetAccount()
            .finally(() => logout())
            .finally(() => {
                signingOut.current = false;
            });
    });

    useEffect(() => {
        const onVisibilityChange = (): void => {
            if (document.visibilityState === 'visible') void check();
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, [check]);
};
