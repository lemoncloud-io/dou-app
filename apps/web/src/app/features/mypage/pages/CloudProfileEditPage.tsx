import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useQueryClient } from '@tanstack/react-query';

import type { CloudView } from '@lemoncloud/chatic-backend-api';
import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';

import { cn } from '@chatic/lib/utils';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { cloudsKeys, useCloudSessionCatalog, useSessionSelection } from '@chatic/web-core';
import { useRuntimeProfile } from '@chatic/app-runtime';

import { useUpdateCloudProfile } from '../hooks';
import { PageHeader } from '../../../ui/components';
import { KeyboardAwareLayout } from '../../../ui/layouts';
import { ROUTES } from '../../../routes/paths';

const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 30;

/**
 * Edits the CLOUD ENTITY's own name — the cloud organization itself, not the connected user's
 * per-cloud profile. Owner-only: only reachable when the active cloud is one the user owns (present
 * in the relay catalog, `view: 'mine'`) and the cloud session is active. Non-owners are redirected
 * out (MyPage also hides the entry for them). The cloud model has no image field, so name is the
 * only editable attribute — there is no thumbnail.
 */
export const CloudProfileEditPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { selectedCloudId } = useSessionSelection();
    const { isCloudActive } = useRuntimeProfile();
    const { clouds, isPendingClouds } = useCloudSessionCatalog();
    const { mutateAsync: updateCloudName, isPending } = useUpdateCloudProfile();

    const isDefaultCloud = !selectedCloudId || selectedCloudId === 'default';
    // The relay catalog lists owned clouds only, so membership here is the ownership signal.
    const activeCloud = clouds.find(cloud => cloud.id === selectedCloudId);
    const isOwner = !!activeCloud;
    const canEdit = !isDefaultCloud && isCloudActive && isOwner;

    // Defensive guard: this screen is owner-only. Redirect out once we can tell the user is not an
    // owner (or the cloud is inactive/default). Wait for the catalog to resolve before judging
    // ownership so an in-flight fetch does not bounce a legitimate owner.
    useEffect(() => {
        if (isDefaultCloud || !isCloudActive) {
            navigate(ROUTES.mypage.root, { replace: true });
            return;
        }
        if (!isPendingClouds && !isOwner) {
            navigate(ROUTES.mypage.root, { replace: true });
        }
    }, [isDefaultCloud, isCloudActive, isPendingClouds, isOwner, navigate]);

    const cloudName = activeCloud?.name ?? '';
    // Capture the initial name once the owned cloud first resolves so change detection is stable.
    const initialRef = useRef({ name: cloudName, initialized: !!activeCloud });
    const [name, setName] = useState(cloudName.slice(0, MAX_NAME_LENGTH));

    useEffect(() => {
        if (!initialRef.current.initialized && activeCloud) {
            const resolved = (activeCloud.name ?? '').slice(0, MAX_NAME_LENGTH);
            initialRef.current = { name: resolved, initialized: true };
            setName(resolved);
        }
    }, [activeCloud]);

    const trimmedName = name.trim();
    const hasChanges = trimmedName !== initialRef.current.name.trim();
    const isValid = trimmedName.length >= MIN_NAME_LENGTH && name.length <= MAX_NAME_LENGTH;

    const handleSave = async () => {
        if (!isValid || !hasChanges || !selectedCloudId || !canEdit) return;
        try {
            await updateCloudName({ id: selectedCloudId, name: trimmedName });

            // `cloud.update` runs over the socket; the relay catalog (home header, cloud switcher,
            // this page) is a separate HTTP query, so patch its cache to reflect the new name.
            queryClient.setQueriesData<ListResult<CloudView>>({ queryKey: cloudsKeys.lists() }, old => {
                if (!old?.list) return old;
                return {
                    ...old,
                    list: old.list.map(c => (c.id === selectedCloudId ? { ...c, name: trimmedName } : c)),
                };
            });

            toast({ title: t('profileEdit.cloudSaveSuccess') });
            navigate(-1);
        } catch (error) {
            logger.error('PROFILE', 'Failed to update cloud name', { error });
            toast({ title: t('profileEdit.cloudSaveError'), variant: 'destructive' });
        }
    };

    return (
        <KeyboardAwareLayout
            className="fixed inset-0 overflow-hidden"
            header={<PageHeader title={t('profileEdit.tabCloud')} />}
            footer={
                <div className="border-t border-border/50 bg-background px-5 py-4">
                    <button
                        onClick={handleSave}
                        disabled={!isValid || !hasChanges || isPending || !canEdit}
                        className={cn(
                            'w-full rounded-2xl py-4 text-[15px] font-semibold transition-all',
                            isValid && hasChanges && !isPending && canEdit
                                ? 'bg-[#B0EA10] text-foreground active:scale-[0.98]'
                                : 'bg-muted text-muted-foreground'
                        )}
                    >
                        {t('profileEdit.save')}
                    </button>
                </div>
            }
        >
            <div className="px-5 pt-4">
                <div className="mb-8">
                    <p className="text-[22px] font-bold leading-tight text-foreground">
                        {t('profileEdit.cloudDescription1')}
                    </p>
                    <p className="text-[22px] font-bold leading-tight text-foreground">
                        {t('profileEdit.cloudDescription2')}
                    </p>
                </div>

                <div className="mb-6">
                    <label className="mb-2 block text-[14px] font-semibold text-foreground">
                        {t('profileEdit.nameLabel')}
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value.slice(0, MAX_NAME_LENGTH))}
                        className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-[15px] text-foreground outline-none transition-colors focus:border-foreground"
                    />
                    <div className="mt-2 flex justify-end">
                        <span className="text-[14px] text-muted-foreground">
                            {name.length}/{MAX_NAME_LENGTH}
                        </span>
                    </div>
                </div>
            </div>
        </KeyboardAwareLayout>
    );
};
