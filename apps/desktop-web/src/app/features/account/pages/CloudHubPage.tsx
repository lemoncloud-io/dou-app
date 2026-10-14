import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { runtime } from '@chatic/app-runtime';

import {
    PageShell,
    SettingsActionRow,
    SettingsNavRow,
    SettingsRowGroup,
    useAccountResetOnLogout,
    useCloudSessionCatalog,
    CLOUD_NAME_MAX,
    useRemoveCloud,
    useRenameCloud,
} from '../../../shared';
import { ConfirmDialog } from '../../channels/components/ConfirmDialog';

/**
 * One owned cloud: rename inline, read-only facts, cascade release behind a
 * confirm. A cloud the catalog does not name is not owned (or a stale link)
 * and routes back to the list. Releasing the ACTIVE cloud logs out, as there
 * is no session left to stand in.
 */
export const CloudHubPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { cloudId } = useParams<{ cloudId: string }>();
    const { clouds, isPendingClouds } = useCloudSessionCatalog();
    const { renameCloud, isRenaming } = useRenameCloud();
    const { deleteOwnedCloud, isDeleting } = useRemoveCloud();
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const logout = runtime.session.useSessionLogout();
    const { resetAccount } = useAccountResetOnLogout();
    const [name, setName] = useState('');
    const [confirmingRelease, setConfirmingRelease] = useState(false);

    const cloud = clouds.find(row => row.id === cloudId);
    const resolved = !isPendingClouds;

    useEffect(() => {
        setName(cloud?.name ?? '');
    }, [cloud?.id, cloud?.name]);

    useEffect(() => {
        if (resolved && cloudId && !cloud) navigate('/account/clouds', { replace: true });
    }, [resolved, cloudId, cloud, navigate]);

    if (!cloud) {
        // The shell stays up while the catalog resolves: a bare spinner names
        // nowhere, and back must work before the cloud it returns from is known.
        return (
            <PageShell
                title={cloudId ?? ''}
                backTo="/account/clouds"
                backLabel={t('cloud.list.title')}
                contentClassName="flex flex-col"
            >
                <div
                    role="status"
                    aria-label={t('chat.loading')}
                    className="flex flex-1 items-center justify-center py-8"
                >
                    <span className="block h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground motion-reduce:animate-none" />
                </div>
            </PageShell>
        );
    }

    const trimmed = name.trim();
    const canSave = !!trimmed && trimmed !== (cloud.name ?? '').trim() && !isRenaming;

    const handleRename = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSave || !cloud.id) return;
        try {
            await renameCloud(cloud.id, trimmed);
            toast({ title: t('cloud.hub.renamed') });
        } catch {
            toast({ title: t('cloud.hub.renameFailed'), variant: 'destructive' });
        }
    };

    const handleReleaseConfirm = async () => {
        if (!cloud.id || isDeleting) return;
        try {
            const result = await deleteOwnedCloud(cloud.id);
            setConfirmingRelease(false);
            if (cloud.id === selectedCloudId) {
                // The session stood in this cloud: release the account state with it.
                void resetAccount().finally(() => logout());
                return;
            }
            toast({ title: t(result === 'already-gone' ? 'cloud.hub.alreadyReleased' : 'cloud.hub.released') });
            navigate('/account/clouds', { replace: true });
        } catch {
            toast({ title: t('cloud.hub.releaseFailed'), variant: 'destructive' });
        }
    };

    return (
        <PageShell
            title={cloud.name ?? cloud.id}
            backTo="/account/clouds"
            backLabel={t('cloud.list.title')}
            contentClassName="flex flex-col"
        >
            <section className="flex flex-col gap-4">
                <h2 className="text-overline uppercase text-muted-foreground">{t('cloud.hub.profile')}</h2>
                <form
                    onSubmit={handleRename}
                    className="flex items-end gap-2 rounded-xl border border-border bg-card p-5"
                >
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <Label htmlFor="cloud-hub-name">{t('cloud.hub.nameLabel')}</Label>
                        <Input
                            id="cloud-hub-name"
                            value={name}
                            maxLength={CLOUD_NAME_MAX}
                            onChange={e => setName(e.target.value)}
                            disabled={isRenaming}
                        />
                    </div>
                    <Button type="submit" disabled={!canSave}>
                        {isRenaming ? t('cloud.hub.saving') : t('cloud.hub.save')}
                    </Button>
                </form>
            </section>

            <section className="mt-8 flex flex-col gap-4">
                <h2 className="text-overline uppercase text-muted-foreground">{t('cloud.hub.places')}</h2>
                <SettingsRowGroup>
                    <SettingsNavRow
                        label={t('cloud.hub.placesOpen')}
                        hint={t('cloud.hub.placesHint')}
                        onClick={() => navigate(`/account/clouds/${cloudId}/places`)}
                    />
                </SettingsRowGroup>
            </section>

            <section className="mt-8 flex flex-col gap-4">
                <h2 className="text-overline uppercase text-muted-foreground">{t('cloud.hub.danger')}</h2>
                <SettingsRowGroup>
                    <SettingsActionRow
                        label={t('cloud.hub.release')}
                        hint={t('cloud.hub.releaseHint')}
                        action={
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="shrink-0 text-destructive focus:text-destructive"
                                onClick={() => setConfirmingRelease(true)}
                            >
                                {t('cloud.hub.releaseAction')}
                            </Button>
                        }
                    />
                </SettingsRowGroup>
            </section>

            <ConfirmDialog
                open={confirmingRelease}
                onOpenChange={setConfirmingRelease}
                title={t('cloud.hub.releaseTitle', { name: cloud.name ?? cloud.id })}
                description={t('cloud.hub.releaseBody', { name: cloud.name ?? cloud.id })}
                confirmLabel={t('cloud.hub.releaseConfirm')}
                onConfirm={handleReleaseConfirm}
                isPending={isDeleting}
                variant="danger"
            />
        </PageShell>
    );
};
