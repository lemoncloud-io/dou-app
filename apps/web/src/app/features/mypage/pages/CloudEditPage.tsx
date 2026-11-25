import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { useQueryClient } from '@tanstack/react-query';

import type { CloudView } from '@lemoncloud/chatic-backend-api';
import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { runtime } from '@chatic/runtime-react';

import { CloudAvatar, FloatingButton, TextField } from '@chatic/web-ui-kit';

import { useUpdateCloudProfile } from '../../../hooks';
import { haptics } from '../../../bridge/haptics';
import { PageHeader } from '../../../ui/components';
import { KeyboardAwareLayout, fixedViewportScreen } from '../../../ui/layouts';
import { ROUTES } from '../../../routes/paths';
import { cloudDisplayName, isCloudEnterable, resolveCloudRowState } from '../../../utils';
import { useOwnedCloud } from '../hooks/useOwnedCloud';

const MIN_NAME_LENGTH = 1;
const MAX_NAME_LENGTH = 20;

export const CloudEditPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { cloudId } = useParams<{ cloudId: string }>();

    const { cloud, isResolved } = useOwnedCloud(cloudId);
    const { mutateAsync: updateCloudName, isPending } = useUpdateCloudProfile();

    useEffect(() => {
        if (isResolved && !cloud) navigate(ROUTES.mypage.cloud.manage, { replace: true });
        if (cloud && cloudId && !isCloudEnterable(resolveCloudRowState(cloud))) {
            navigate(ROUTES.mypage.cloud.hub(cloudId), { replace: true });
        }
    }, [isResolved, cloud, cloudId, navigate]);

    const initialRef = useRef<{ name: string; initialized: boolean }>({ name: '', initialized: false });
    const [name, setName] = useState('');

    useEffect(() => {
        if (!initialRef.current.initialized && cloud) {
            const resolved = cloudDisplayName(cloud).slice(0, MAX_NAME_LENGTH);
            initialRef.current = { name: resolved, initialized: true };
            setName(resolved);
        }
    }, [cloud]);

    const trimmedName = name.trim();
    const hasChanges = trimmedName !== initialRef.current.name.trim();
    const isValid = trimmedName.length >= MIN_NAME_LENGTH && name.length <= MAX_NAME_LENGTH;
    const canSave = isValid && hasChanges && !isPending;

    const handleSave = async () => {
        if (!canSave || !cloudId) return;
        try {
            await updateCloudName({ id: cloudId, name: trimmedName });

            queryClient.setQueriesData<ListResult<CloudView>>({ queryKey: runtime.data.cloudsKeys.lists() }, old => {
                if (!old?.list) return old;
                return { ...old, list: old.list.map(c => (c.id === cloudId ? { ...c, name: trimmedName } : c)) };
            });

            haptics.play('success');
            toast({ title: t('profileEdit.cloudSaveSuccess') });
            navigate(-1);
        } catch (error) {
            logger.error('PROFILE', 'Failed to update cloud name', { error });
            haptics.play('error');
            toast({ title: t('profileEdit.cloudSaveError'), variant: 'destructive' });
        }
    };

    return (
        <KeyboardAwareLayout
            className={fixedViewportScreen}
            headerSafeArea={false}
            header={<PageHeader title={t('mypage.cloudManage.edit.title')} />}
            footer={
                <FloatingButton
                    label={t('profileEdit.save')}
                    disabled={!canSave}
                    loading={isPending}
                    onClick={handleSave}
                />
            }
        >
            <div className="flex flex-col gap-8 py-10">
                <div className="flex flex-col items-center gap-3">
                    <CloudAvatar name={trimmedName || cloudDisplayName(cloud ?? {})} size="xl" />
                </div>
                <TextField
                    label={t('mypage.cloudManage.edit.nameLabel')}
                    required
                    value={name}
                    onChange={value => setName(value.slice(0, MAX_NAME_LENGTH))}
                    maxLength={MAX_NAME_LENGTH}
                    description={t('mypage.cloudManage.edit.nameHelper', { max: MAX_NAME_LENGTH })}
                />
            </div>
        </KeyboardAwareLayout>
    );
};
