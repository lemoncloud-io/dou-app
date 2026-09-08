import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useQueryClient } from '@tanstack/react-query';

import { runtime } from '@chatic/app-runtime';

import { InAppNotificationCard } from '../../ui/components/InAppNotificationCard';

/**
 * Server-owned envelope type for the cloud-activation unicast. Not enforced by any shared type:
 * the backend picks this string, so a rename there goes silent here (ADR-0075 리스크 R3).
 */
const CLOUD_ACTIVATED_EVENT = 'cloud.activated';

/** Fixed toast id so a burst (an upgrade provisions several clouds) replaces rather than stacks. */
const CLOUD_ACTIVATED_TOAST_ID = 'cloud-activated';

/** Same lifetime as the foreground push banner — long enough to read, short enough to not obstruct. */
const TOAST_DURATION_MS = 5_000;

const TITLE_KEY = 'notifications.cloudActivated.title';

/** What the server puts in the envelope's `data`. */
interface CloudActivatedEvent {
    id?: string;
    name?: string;
}

/**
 * Cloud activation over the socket (ADR-0075). Mounted once under AppRuntime, alongside
 * `CloudPushMarkRunner`.
 *
 * The server sends ONE notification when a cloud first goes active, and the delivery layer picks the
 * transport: websocket while the owner is connected, push otherwise. Because it picks ONE, a
 * connected owner gets NO push — so without this subscription an owner with the app open learns
 * nothing until they happen to look at the cloud list.
 *
 * **Pinned to the relay slot, not the active one.** The unicast targets a user and is delivered by
 * the relay deployment, so it arrives on the relay socket even while a cloud socket is active. The
 * active-slot `onType` would miss it exactly when it matters most — sitting inside cloud A while
 * cloud B finishes provisioning is the common case, not the edge one.
 *
 * Two effects, deliberately independent:
 * - The cache invalidation always runs. It is what turns the provisioning row into an active one.
 * - The banner only renders when its copy resolves. Web i18n is served remotely, so the key can be
 *   absent on a client whose bundle predates it; a banner reading `notifications.cloudActivated.title`
 *   is worse than no banner, and the list still updates underneath either way.
 *
 * The banner has no click action on purpose: a push tap for the same event goes to the root, and one
 * notification should not land somewhere different depending on how it arrived.
 */
export const CloudActivatedRunner = (): null => {
    const queryClient = useQueryClient();
    // `i18n` (not `t`) so the effect does not tear the socket subscription down and rebuild it on
    // every language change: the instance is stable, and `i18n.t` reads the live language anyway.
    const { i18n } = useTranslation();

    useEffect(
        () =>
            runtime.connection
                .getSocketManager()
                .onSlotType<CloudActivatedEvent>('relay', CLOUD_ACTIVATED_EVENT, ({ data }) => {
                    void queryClient.invalidateQueries({ queryKey: runtime.data.cloudsKeys.all });

                    if (!i18n.exists(TITLE_KEY)) return;
                    // The id stands in for an unnamed cloud, matching the push copy's own fallback —
                    // clouds do get created without a name.
                    const name = data?.name?.trim() || data?.id?.trim();
                    if (!name) return;

                    toast.custom(() => <InAppNotificationCard title={i18n.t(TITLE_KEY, { name })} />, {
                        id: CLOUD_ACTIVATED_TOAST_ID,
                        duration: TOAST_DURATION_MS,
                        position: 'top-center',
                    });
                }),
        [queryClient, i18n]
    );

    return null;
};
