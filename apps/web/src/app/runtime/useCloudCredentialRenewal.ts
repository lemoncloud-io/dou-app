import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/runtime-react';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { useAppForeground } from '../bridge';
import { useCachedCloudNames } from '../hooks';
import { useSessionLogout } from './useSessionLogout';

export const useCloudCredentialRenewal = (): void => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const cachedCloudNames = useCachedCloudNames();
    const { check } = runtime.session.useCloudCredentialGuard();
    const logout = useSessionLogout();
    const signingOut = useRef(false);
    const pairedCloudCheck = runtime.session.usePairedCloudCheck(cloudId => {
        const name = cachedCloudNames[cloudId];
        toast({ title: name ? t('pairing.cloud.endedNamed', { cloud: name }) : t('pairing.cloud.ended') });
        if (signingOut.current) return;
        signingOut.current = true;
        void logout().finally(() => {
            signingOut.current = false;
        });
    });

    useAppForeground(() => {
        void check();
        void pairedCloudCheck.check();
    });
};
