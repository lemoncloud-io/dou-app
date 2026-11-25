import { useTranslation } from 'react-i18next';

import type { runtime } from '@chatic/runtime-react';

import { useCloudSessionCatalog } from '../../../shared';
import { ConfirmDialog } from '../../channels/components/ConfirmDialog';

interface PairingLogoutDialogProps {
    logout: runtime.session.PairingAwareLogout;
}

export const PairingLogoutDialog = ({ logout }: PairingLogoutDialogProps) =>
    logout.pending ? <OpenPairingLogoutDialog logout={logout} /> : null;

const OpenPairingLogoutDialog = ({ logout }: PairingLogoutDialogProps) => {
    const { t } = useTranslation();
    const { clouds } = useCloudSessionCatalog();
    const rows = logout.pending ?? [];
    const cloudName = (cloudId?: string) => clouds.find(cloud => cloud.id === cloudId)?.name || cloudId || '';
    const lines = rows.map(row =>
        [
            row.client.name || t('pairing.approve.unknownClient'),
            row.target.type === 'relay'
                ? t('pairing.approve.target.relay')
                : t('pairing.approve.target.cloud', { cloud: cloudName(row.target.cloudId) }),
        ].join(' · ')
    );
    const cloudNote = rows.some(row => row.target.type === 'cloud') ? t('pairing.logout.cloudNote') : null;

    return (
        <ConfirmDialog
            open={!!logout.pending}
            onOpenChange={open => !open && logout.cancel()}
            title={t('pairing.logout.title', { count: rows.length })}
            description={[...lines, cloudNote].filter(Boolean).join('\n')}
            confirmLabel={t('pairing.logout.confirm')}
            onConfirm={() => void logout.confirm()}
            isPending={logout.busy}
            fullDescription
        />
    );
};
