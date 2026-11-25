import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/runtime-react';
import { toast } from '@chatic/ui-kit';

import { useAccountResetOnLogout } from '../shared';

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
