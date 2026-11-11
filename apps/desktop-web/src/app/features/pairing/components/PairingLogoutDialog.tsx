import { useTranslation } from 'react-i18next';

import type { runtime } from '@chatic/app-runtime';

import { useCloudSessionCatalog } from '../../../shared';
import { ConfirmDialog } from '../../channels/components/ConfirmDialog';

interface PairingLogoutDialogProps {
    /** The confirm from `runtime.session.usePairingAwareLogout`. */
    logout: runtime.session.PairingAwareLogout;
}

/**
 * "The sign-ins this app approved end too." Open while an approving desktop app is signing out with
 * approvals still standing: each one with its requester and scope, and the caveat about cloud screens
 * already open when a cloud approval is among them.
 */
export const PairingLogoutDialog = ({ logout }: PairingLogoutDialogProps) =>
    // Mounted only while a confirm is open, so a menu that never signs out never reads the catalog.
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
