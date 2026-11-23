import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';

import { runtime } from '@chatic/runtime';
import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { MenuCard } from '@chatic/web-ui-kit';

import { useCloudName, useDevicePairingEnabled, useIsAccountGuest } from '../../../hooks';
import { ROUTES } from '../../../routes/paths';
import { PageHeader } from '../../../ui/components';
import { SafeAreaBottomSpacer } from '../../../ui/components/SafeAreaBottomSpacer';
import { ConfirmDialog } from '../../channels/components/ConfirmDialog';
import { useApprovedPairings, useMyDevices, useRevokePairing, useUnlinkDevice } from '../hooks';
import { approvedPairingRows, deviceKindKey } from '../lib/deviceRows';

const RELAY_SELECTION = 'default';

export const PairingDevicesPage = () => {
    const enabled = useDevicePairingEnabled();
    const isGuest = useIsAccountGuest();
    if (!enabled || (isGuest && runtime.signIn.sessionScope !== 'device')) {
        return <Navigate to={ROUTES.mypage.root} replace />;
    }
    return <PairingDevicesScreen />;
};

type Pending = { kind: 'device'; id: string } | { kind: 'pairing'; id: string; cloud: boolean } | null;

const PairingDevicesScreen = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigateWithTransition();
    const isPaired = runtime.session.useIsPairedSession();
    const isGuest = useIsAccountGuest();
    const showApprovals = runtime.signIn.approvesPairing && !isGuest && !isPaired;
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const onCloud = !!selectedCloudId && selectedCloudId !== RELAY_SELECTION;
    const cloudName = useCloudName();

    const devices = useMyDevices();
    const unlink = useUnlinkDevice();
    const pairings = useApprovedPairings(showApprovals);
    const revoke = useRevokePairing();
    const approvals = pairings.data && approvedPairingRows(pairings.data.list);
    const [pending, setPending] = useState<Pending>(null);
    const { toast } = useToast();

    const time = (ms?: number) =>
        ms ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(ms) : '';

    const confirm = async () => {
        if (!pending) return;
        try {
            if (pending.kind === 'device') await unlink.mutateAsync(pending.id);
            else await revoke.mutateAsync(pending.id);
        } catch {
            toast({
                title: t(pending.kind === 'device' ? 'pairing.devices.unlinkFailed' : 'pairing.devices.revokeFailed'),
                variant: 'destructive',
            });
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
                    {devices.data && devices.data.list.length === 0 && (
                        <p className="text-[14px] text-description" data-testid="pairing-devices-empty">
                            {t('pairing.devices.noDevices')}
                        </p>
                    )}
                    {devices.data && devices.data.list.length > 0 && (
                        <MenuCard>
                            {devices.data.list.map(device => (
                                <div
                                    key={device.id}
                                    className="flex items-center gap-3 px-4 py-3"
                                    data-testid={`device-row-${device.id}`}
                                >
                                    <div className="flex min-w-0 flex-1 flex-col">
                                        <span className="truncate text-[15px] text-foreground">
                                            {runtime.session.deviceDisplayName(device) ||
                                                t('pairing.devices.kind.unknown')}
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
                        {approvals?.length === 0 && (
                            <p className="text-[14px] text-description" data-testid="pairing-approvals-empty">
                                {t('pairing.devices.noApprovals')}
                            </p>
                        )}
                        {!!approvals?.length && (
                            <MenuCard>
                                {approvals.map(row => (
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
                <SafeAreaBottomSpacer />
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
