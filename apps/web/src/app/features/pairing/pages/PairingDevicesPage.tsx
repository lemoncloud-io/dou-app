import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';

import { isNative } from '@chatic/bridges';
import { runtime } from '@chatic/app-runtime';
import { useNavigateWithTransition } from '@chatic/shared';
import { MenuCard } from '@chatic/web-ui-kit';

import { useCloudSessionCatalog, useIsAccountGuest } from '../../../hooks';
import { ROUTES } from '../../../routes/paths';
import { PageHeader } from '../../../ui/components';
import { ConfirmDialog } from '../../channels/components/ConfirmDialog';
import {
    useApprovedPairings,
    useDevicePairingEnabled,
    useMyDevices,
    useRevokePairing,
    useUnlinkDevice,
} from '../hooks';
import { approvedPairingRows, deviceKindKey } from '../lib/deviceRows';

const RELAY_SELECTION = 'default';

/**
 * My devices, and — on an approving app — the web sign-ins it approved.
 *
 * A browser guest has no account whose devices there are to list; anyone else sees the first section.
 * The second is the approver's: inside the app, on a session that is not itself signed in through an
 * approval (the relay answers 403 to anyone else anyway).
 */
export const PairingDevicesPage = () => {
    const enabled = useDevicePairingEnabled();
    const isGuest = useIsAccountGuest();
    if (!enabled || (isGuest && !isNative())) return <Navigate to={ROUTES.mypage.root} replace />;
    return <PairingDevicesScreen />;
};

type Pending = { kind: 'device'; id: string } | { kind: 'pairing'; id: string; cloud: boolean } | null;

const PairingDevicesScreen = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigateWithTransition();
    const isPaired = runtime.session.useIsPairedSession();
    const isGuest = useIsAccountGuest();
    // The approvals are an approving app's: an account's, not a secondary device's.
    const showApprovals = isNative() && !isGuest && !isPaired;
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const onCloud = !!selectedCloudId && selectedCloudId !== RELAY_SELECTION;
    const { clouds } = useCloudSessionCatalog();
    const cloudName = (cloudId?: string) => clouds.find(cloud => cloud.id === cloudId)?.name || cloudId || '';

    const devices = useMyDevices();
    const unlink = useUnlinkDevice();
    const pairings = useApprovedPairings(showApprovals);
    const revoke = useRevokePairing();
    const [pending, setPending] = useState<Pending>(null);

    const time = (ms?: number) =>
        ms ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(ms) : '';

    const confirm = async () => {
        if (!pending) return;
        try {
            if (pending.kind === 'device') await unlink.mutateAsync(pending.id);
            else await revoke.mutateAsync(pending.id);
        } finally {
            setPending(null);
        }
    };

    return (
        <div className="flex h-full flex-col bg-background">
            <PageHeader title={t('pairing.devices.title')} onBack={() => navigate(-1)} />
            <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 pt-4 pb-10">
                <section className="flex flex-col gap-2" data-testid="pairing-devices">
                    <h2 className="text-[13px] font-semibold text-description">
                        {onCloud ? t('pairing.devices.cloudHeader') : t('pairing.devices.header')}
                    </h2>
                    {devices.isPending && <Loader2 className="mx-auto animate-spin" size={22} aria-hidden />}
                    {devices.isError && (
                        <div className="flex flex-col items-start gap-2" data-testid="pairing-devices-error">
                            <p className="text-[14px] text-foreground">{t('pairing.devices.loadFailed')}</p>
                            <button
                                type="button"
                                onClick={() => void devices.refetch()}
                                className="text-[14px] text-primary"
                            >
                                {t('pairing.code.retry')}
                            </button>
                        </div>
                    )}
                    {devices.data && (
                        <MenuCard>
                            {devices.data.list.map(device => (
                                <div
                                    key={device.id}
                                    className="flex items-center gap-3 px-4 py-3"
                                    data-testid={`device-row-${device.id}`}
                                >
                                    <div className="flex min-w-0 flex-1 flex-col">
                                        <span className="truncate text-[15px] text-foreground">
                                            {device.name || t('pairing.devices.kind.unknown')}
                                            {device.current && (
                                                <span className="ml-2 text-[12px] text-primary">
                                                    {t('pairing.devices.thisDevice')}
                                                </span>
                                            )}
                                        </span>
                                        <span className="text-[12px] text-description">
                                            {t(deviceKindKey(device.kind))} ·{' '}
                                            {device.presence === 'green'
                                                ? t('pairing.devices.online')
                                                : t('pairing.devices.lastActive', { time: time(device.lastActiveAt) })}
                                        </span>
                                    </div>
                                    {!device.current && (
                                        <button
                                            type="button"
                                            onClick={() => setPending({ kind: 'device', id: device.id })}
                                            className="text-[14px] text-destructive"
                                            data-testid={`device-unlink-${device.id}`}
                                        >
                                            {t('pairing.devices.unlink')}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </MenuCard>
                    )}
                </section>

                {showApprovals && (
                    <section className="flex flex-col gap-2" data-testid="pairing-approvals">
                        <div className="flex items-center justify-between">
                            <h2 className="text-[13px] font-semibold text-description">
                                {t('pairing.devices.approvedHeader')}
                            </h2>
                            <button
                                type="button"
                                onClick={() => navigate(ROUTES.mypage.pairing.approve)}
                                className="text-[13px] text-primary"
                            >
                                {t('pairing.entry.approve')}
                            </button>
                        </div>
                        {pairings.isError && (
                            <p className="text-[14px] text-foreground">{t('pairing.devices.loadFailed')}</p>
                        )}
                        {pairings.data && approvedPairingRows(pairings.data.list).length === 0 && (
                            <p className="text-[14px] text-description">{t('pairing.devices.noApprovals')}</p>
                        )}
                        {pairings.data && (
                            <MenuCard>
                                {approvedPairingRows(pairings.data.list).map(row => (
                                    <div
                                        key={row.pairingId}
                                        className="flex items-center gap-3 px-4 py-3"
                                        data-testid={`pairing-row-${row.pairingId}`}
                                    >
                                        <div className="flex min-w-0 flex-1 flex-col">
                                            <span className="truncate text-[15px] text-foreground">
                                                {row.client.name || t('pairing.approve.unknownClient')}
                                                {row.purpose === 'debug' && ` · ${t('pairing.devices.kind.cli')}`}
                                            </span>
                                            <span className="text-[12px] text-description">
                                                {row.target.type === 'relay'
                                                    ? t('pairing.scope.relayLabel')
                                                    : t('pairing.scope.cloudLabel', {
                                                          cloud: cloudName(row.target.cloudId),
                                                      })}
                                                {' · '}
                                                {t('pairing.devices.approvedAt', { time: time(row.approvedAt) })}
                                                {row.claimedAt &&
                                                    ` · ${t('pairing.devices.claimedAt', { time: time(row.claimedAt) })}`}
                                            </span>
                                            {row.unclaimed && (
                                                <span
                                                    className="text-[12px] text-destructive"
                                                    data-testid="pairing-unclaimed"
                                                >
                                                    {t('pairing.devices.unclaimed')}
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setPending({
                                                    kind: 'pairing',
                                                    id: row.pairingId,
                                                    cloud: row.target.type === 'cloud',
                                                })
                                            }
                                            className="text-[14px] text-destructive"
                                            data-testid={`pairing-revoke-${row.pairingId}`}
                                        >
                                            {t('pairing.devices.unlink')}
                                        </button>
                                    </div>
                                ))}
                            </MenuCard>
                        )}
                    </section>
                )}
            </div>

            <ConfirmDialog
                open={!!pending}
                onOpenChange={open => !open && setPending(null)}
                title={t('pairing.devices.confirmTitle')}
                description={
                    pending?.kind === 'device'
                        ? `${t('pairing.devices.unlinkBody')}${onCloud ? ` ${t('pairing.devices.unlinkCloudNote')}` : ''}`
                        : pending?.cloud
                          ? t('pairing.devices.revokeCloudBody')
                          : t('pairing.devices.revokeRelayBody')
                }
                confirmLabel={t('pairing.devices.unlink')}
                onConfirm={() => void confirm()}
                isPending={unlink.isPending || revoke.isPending}
                closeOnConfirm={false}
            />
        </div>
    );
};
