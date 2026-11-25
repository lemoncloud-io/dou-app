import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useQueryClient } from '@tanstack/react-query';

import { runtime } from '@chatic/runtime-react';

import { InAppNotificationCard } from '../../ui/components/InAppNotificationCard';

const CLOUD_ACTIVATED_EVENT = 'cloud.activated';

const CLOUD_ACTIVATED_TOAST_ID = 'cloud-activated';

const TOAST_DURATION_MS = 5_000;

const TITLE_KEY = 'notifications.cloudActivated.title';

interface CloudActivatedEvent {
    id?: string;
    name?: string;
}

export const CloudActivatedRunner = (): null => {
    const queryClient = useQueryClient();
    const { i18n } = useTranslation();

    useEffect(
        () =>
            runtime.connection.onServerEvent<CloudActivatedEvent>(
                CLOUD_ACTIVATED_EVENT,
                ({ data }) => {
                    void queryClient.invalidateQueries({ queryKey: runtime.data.cloudsKeys.all });

                    if (!i18n.exists(TITLE_KEY)) return;
                    const name = data?.name?.trim() || data?.id?.trim();
                    if (!name) return;

                    toast.custom(() => <InAppNotificationCard title={i18n.t(TITLE_KEY, { name })} />, {
                        id: CLOUD_ACTIVATED_TOAST_ID,
                        duration: TOAST_DURATION_MS,
                        position: 'top-center',
                    });
                },
                { slot: runtime.connection.RELAY_SLOT }
            ),
        [queryClient, i18n]
    );

    return null;
};
