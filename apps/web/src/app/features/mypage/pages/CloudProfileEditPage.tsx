import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useQueryClient } from '@tanstack/react-query';

import type { CloudView } from '@lemoncloud/chatic-backend-api';
import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { cloudsKeys, useSessionSelection } from '@chatic/web-core';

import { FloatingButton, TextField } from '@chatic/web-ui-kit';

import { useUpdateCloudProfile } from '../hooks';
import { useActiveCloudOwnership } from '../../../hooks';
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
    // Same ownership test the AccountInfoPage entry uses, so the row and this screen cannot disagree.
    const { activeCloud, isCloudSessionReady, isOwner, isPending: isPendingClouds } = useActiveCloudOwnership();
    const { mutateAsync: updateCloudName, isPending } = useUpdateCloudProfile();

    const canEdit = isOwner;

    // Defensive guard: this screen is owner-only. Redirect out once we can tell the user is not an
    // owner (or the cloud is inactive/default). Wait for the catalog to resolve before judging
    // ownership so an in-flight fetch does not bounce a legitimate owner.
    useEffect(() => {
        if (!isCloudSessionReady) {
            navigate(ROUTES.mypage.root, { replace: true });
            return;
        }
        if (!isPendingClouds && !isOwner) {
            navigate(ROUTES.mypage.root, { replace: true });
        }
    }, [isCloudSessionReady, isPendingClouds, isOwner, navigate]);

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
                <FloatingButton
                    label={t('profileEdit.save')}
                    disabled={!isValid || !hasChanges || isPending || !canEdit}
                    loading={isPending}
                    onClick={handleSave}
                />
            }
        >
            {/* Same spacing rhythm as PlaceEditPage, minus the photo block — the cloud model has no image field. */}
            <div className="flex flex-col gap-8 py-10">
                <TextField
                    label={t('profileEdit.nameLabel')}
                    required
                    value={name}
                    onChange={value => setName(value.slice(0, MAX_NAME_LENGTH))}
                    maxLength={MAX_NAME_LENGTH}
                    enterKeyHint="done"
                    onKeyDown={e => {
                        // "Done" key dismisses the keyboard; ignore Enter while an IME is composing.
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            e.currentTarget.blur();
                        }
                    }}
                />
            </div>
        </KeyboardAwareLayout>
    );
};
