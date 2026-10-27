import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { runtime } from '@chatic/app-runtime';
import { Button } from '@chatic/ui-kit/components/ui/button';

import { PageShell, formatListTime, isRelayGuest, toastFailure, useCloudSessionCatalog } from '../../../shared';
import { ConfirmDialog } from '../../channels/components/ConfirmDialog';
import { canApprovePairing, isDevicePairingEnabled } from '../utils/devicePairing';
import { devicesKeys, pairingsKeys } from '../utils/queryKeys';
import type { DeviceEntry, PairingListItem } from '../utils/types';

const KIND_KEYS = {
    mobile: 'pairing.devices.kind.mobile',
    desktop: 'pairing.devices.kind.desktop',
    web: 'pairing.devices.kind.web',
    cli: 'pairing.devices.kind.cli',
} as const;

/** The label for a device's kind; a kind the server left empty, or one this build does not know, is "unknown". */
export const deviceKindKey = (kind: string) =>
    KIND_KEYS[kind as keyof typeof KIND_KEYS] ?? ('pairing.devices.kind.unknown' as const);

const SectionHeader = ({ title, action }: { title: string; action?: ReactNode }) => (
    <div className="flex items-center justify-between gap-3">
        <h2 className="text-overline uppercase text-muted-foreground">{title}</h2>
        {action}
    </div>
);

const SectionState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => {
    const { t } = useTranslation();
    return (
        <div
            role={onRetry ? 'alert' : undefined}
            className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center"
        >
            <p className="text-callout text-muted-foreground">{message}</p>
            {onRetry && (
                <Button variant="outline" size="sm" onClick={onRetry}>
                    {t('chat.retry')}
                </Button>
            )}
        </div>
    );
};

const SectionLoading = () => {
    const { t } = useTranslation();
    return (
        <div role="status" aria-label={t('chat.loading')} className="flex justify-center py-6">
            <span className="block h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground motion-reduce:animate-none" />
        </div>
    );
};

const ROW = 'flex items-center gap-3 px-5 py-4';
const GROUP = 'overflow-hidden rounded-xl border border-border bg-card divide-y divide-border';

/**
 * The account's devices and, in the desktop app, the browser sign-ins it approved.
 *
 * The device list is read on the active slot: on the relay it is the account's devices, inside a cloud
 * that cloud's. A browser let into one cloud by a pairing has a device there but none on the relay, so
 * ending its sign-in takes the approval list as well — the confirmations say so.
 *
 * A guest has neither: its devices are this one, and it cannot approve for its relay account.
 */
export const DevicesPage = () => {
    const { t } = useTranslation();
    const isPaired = runtime.session.useIsPairedSession();
    const [allowed] = useState(() => isDevicePairingEnabled() && !isRelayGuest());
    if (!allowed) return <Navigate to="/account" replace />;

    return (
        <PageShell
            title={t('pairing.devices.title')}
            backTo="/account"
            backLabel={t('account.title')}
            contentClassName="flex flex-col gap-8"
        >
            <DeviceSection />
            {canApprovePairing(isPaired) && <ApprovedSection />}
        </PageShell>
    );
};

const DeviceSection = () => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { user } = runtime.data.useRuntimeRepositories();
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const inCloud = !!selectedCloudId && selectedCloudId !== 'default';
    const [unlinking, setUnlinking] = useState<DeviceEntry | null>(null);

    const devices = useQuery({
        queryKey: devicesKeys.list({ cloudId: selectedCloudId ?? 'default' }),
        queryFn: () => user.listDevices(),
        // A cloud that does not serve the list answers with an error that a retry will not change; the
        // section says so at once and leaves the retry to the person.
        retry: false,
        refetchOnWindowFocus: false,
    });

    const unlink = useMutation({
        mutationFn: (device: DeviceEntry) => user.unlinkDevice(device.id),
        onSuccess: () => {
            setUnlinking(null);
            void queryClient.invalidateQueries({ queryKey: devicesKeys.all });
        },
        onError: error => {
            setUnlinking(null);
            toastFailure(t('pairing.devices.unlinkFailed'), error);
        },
    });

    const list = devices.data?.list ?? [];

    return (
        <section className="flex flex-col gap-3">
            <SectionHeader title={t(inCloud ? 'pairing.devices.sectionCloud' : 'pairing.devices.section')} />
            {devices.isPending ? (
                <SectionLoading />
            ) : devices.isError ? (
                <SectionState message={t('pairing.devices.failed')} onRetry={() => void devices.refetch()} />
            ) : list.length === 0 ? (
                <SectionState message={t('pairing.devices.empty')} />
            ) : (
                <ul className={GROUP}>
                    {list.map(device => {
                        const name = device.name || t('pairing.devices.unknownName');
                        return (
                            <li key={device.id} className={ROW} data-testid="device-row">
                                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                    <span className="flex min-w-0 items-center gap-2">
                                        <span className="truncate text-callout font-medium text-foreground">
                                            {name}
                                        </span>
                                        {device.current && (
                                            <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-micro font-medium text-foreground">
                                                {t('pairing.devices.current')}
                                            </span>
                                        )}
                                    </span>
                                    <span className="text-caption text-muted-foreground">
                                        {t(deviceKindKey(device.kind))}
                                        {' · '}
                                        {device.presence === 'green'
                                            ? t('pairing.devices.online')
                                            : device.lastActiveAt
                                              ? t('pairing.devices.lastActive', {
                                                    time: formatListTime(device.lastActiveAt),
                                                })
                                              : t('pairing.devices.offline')}
                                    </span>
                                </div>
                                {/* The device in use is signed out with logout, never from this list. */}
                                {!device.current && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setUnlinking(device)}
                                        aria-label={t('pairing.devices.unlinkOne', { name })}
                                    >
                                        {t('pairing.unlink')}
                                    </Button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
            <ConfirmDialog
                open={unlinking !== null}
                onOpenChange={open => !open && setUnlinking(null)}
                title={t('pairing.devices.unlinkTitle', {
                    name: unlinking?.name || t('pairing.devices.unknownName'),
                })}
                description={t(inCloud ? 'pairing.devices.unlinkBodyCloud' : 'pairing.devices.unlinkBody')}
                confirmLabel={t('pairing.unlink')}
                fullDescription
                isPending={unlink.isPending}
                onConfirm={() => unlinking && unlink.mutate(unlinking)}
            />
        </section>
    );
};

const ApprovedSection = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { pairing } = runtime.data.useRuntimeRepositories();
    const { clouds } = useCloudSessionCatalog();
    const [revoking, setRevoking] = useState<PairingListItem | null>(null);

    const pairings = useQuery({
        queryKey: pairingsKeys.lists(),
        queryFn: () => pairing.listPairings(),
        retry: false,
        refetchOnWindowFocus: false,
    });

    const revoke = useMutation({
        mutationFn: (item: PairingListItem) => pairing.revokePairing(item.pairingId),
        onSuccess: () => {
            setRevoking(null);
            void queryClient.invalidateQueries({ queryKey: pairingsKeys.all });
        },
        onError: error => {
            setRevoking(null);
            toastFailure(t('pairing.approved.revokeFailed'), error);
        },
    });

    // Only what is still in force: a declined, expired or withdrawn pairing has nothing left to end.
    const list = (pairings.data?.list ?? []).filter(item => item.status === 'approved');
    const cloudName = (cloudId: string | undefined) =>
        clouds.find(cloud => cloud.id === cloudId)?.name || cloudId || '';
    const scopeOf = (item: PairingListItem) =>
        item.target.type === 'cloud'
            ? t('pairing.approve.target.cloud', { cloud: cloudName(item.target.cloudId) })
            : t('pairing.approve.target.relay');

    return (
        <section className="flex flex-col gap-3">
            <SectionHeader
                title={t('pairing.approved.section')}
                action={
                    <Button
                        variant="link"
                        size="sm"
                        onClick={() => navigate('/settings/pairing/approve', { state: { from: '/account/devices' } })}
                    >
                        {t('pairing.approve.entry')}
                    </Button>
                }
            />
            {pairings.isPending ? (
                <SectionLoading />
            ) : pairings.isError ? (
                <SectionState message={t('pairing.approved.failed')} onRetry={() => void pairings.refetch()} />
            ) : list.length === 0 ? (
                <SectionState message={t('pairing.approved.empty')} />
            ) : (
                <ul className={GROUP}>
                    {list.map(item => {
                        const name = item.client.name || t('pairing.approve.unknownClient');
                        // A relay approval that was never claimed is a session waiting for whoever holds the
                        // code's browser. A cloud approval has no claim to wait for, so it never shows this.
                        const unclaimed = item.target.type === 'relay' && !item.claimedAt;
                        return (
                            <li key={item.pairingId} className={ROW} data-testid="pairing-row">
                                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                    <span className="flex min-w-0 items-center gap-2">
                                        <span className="truncate text-callout font-medium text-foreground">
                                            {name}
                                        </span>
                                        {item.purpose === 'debug' && (
                                            <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-micro font-medium text-destructive">
                                                {t('pairing.devices.kind.cli')}
                                            </span>
                                        )}
                                    </span>
                                    <span className="text-caption text-muted-foreground">
                                        {[
                                            scopeOf(item),
                                            item.approvedAt &&
                                                t('pairing.approved.approvedAt', {
                                                    time: formatListTime(item.approvedAt),
                                                }),
                                            item.claimedAt &&
                                                t('pairing.approved.claimedAt', {
                                                    time: formatListTime(item.claimedAt),
                                                }),
                                        ]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    </span>
                                    {unclaimed && (
                                        <span className="text-caption text-destructive">
                                            {t('pairing.approved.unclaimed')}
                                        </span>
                                    )}
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setRevoking(item)}
                                    aria-label={t('pairing.devices.unlinkOne', { name })}
                                >
                                    {t('pairing.unlink')}
                                </Button>
                            </li>
                        );
                    })}
                </ul>
            )}
            <ConfirmDialog
                open={revoking !== null}
                onOpenChange={open => !open && setRevoking(null)}
                title={t('pairing.devices.unlinkTitle', {
                    name: revoking?.client.name || t('pairing.approve.unknownClient'),
                })}
                description={t(
                    revoking?.target.type === 'cloud'
                        ? 'pairing.approved.revokeBodyCloud'
                        : 'pairing.approved.revokeBodyRelay'
                )}
                confirmLabel={t('pairing.unlink')}
                fullDescription
                isPending={revoke.isPending}
                onConfirm={() => revoking && revoke.mutate(revoking)}
            />
        </section>
    );
};
