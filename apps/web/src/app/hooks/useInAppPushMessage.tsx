import { useCallback } from 'react';
import { matchPath } from 'react-router-dom';
import { toast } from 'sonner';

import { useSessionIdentity } from '@chatic/web-core';
import type { AppMessageData } from '@chatic/app-messages';

import { useOnReceiveNotification, usePushNavigate } from '../bridge';
import { ROUTES } from '../routes/paths';
import { InAppNotificationCard } from '../ui/components/InAppNotificationCard';
import { resolveInAppPushRoute, type InAppPushData } from '../utils/resolveInAppPushRoute';

/** Fixed toast id so consecutive pushes replace the banner instead of stacking. */
const IN_APP_PUSH_TOAST_ID = 'in-app-push-message';

/** Messenger-conventional banner lifetime — long enough to read, short enough to not obstruct. */
const IN_APP_PUSH_DURATION_MS = 5_000;

/**
 * Headline for the banner: the channel (`#name`) when known — sender titles baked by
 * the backend are unreliable (same policy as desktop-web's cross-cloud presenter) —
 * else the push's own title.
 */
const headline = (channelName: string | undefined, title: string | undefined): string =>
    channelName ? `#${channelName}` : (title ?? '');

/**
 * Presents foreground pushes (`OnReceiveNotification`) as an in-app banner, Slack/Kakao
 * style, and routes a click through the same push-navigation path as an OS notification
 * tap (`usePushNavigate`: cloud/site switch + history normalization).
 *
 * Suppression rules, matching the desktop-web presenter's conventions:
 * - Silent/data-only pushes (no title and no body) never surface — badges consume them.
 * - My own messages echoed back via push are noise, not news.
 * - The room the user is currently reading needs no banner (messenger convention).
 *
 * Must be used within the router tree (relies on `usePushNavigate`).
 */
export const useInAppPushMessage = (): void => {
    const navigateToPush = usePushNavigate();
    const { userId } = useSessionIdentity();

    const handleReceiveNotification = useCallback(
        (message: AppMessageData<'OnReceiveNotification'>) => {
            const notification = message.data?.notification;
            const title = notification?.title;
            const body = notification?.body;
            if (!title && !body) return;

            const data: InAppPushData = notification?.data ?? {};
            if (userId && String(data.ownerId) === String(userId)) return;

            // The current channel is read from the live pathname (not `useLocation`) so the
            // check sees where the user is at event time, without re-rendering per route.
            if (data.channelId) {
                const match = matchPath(ROUTES.channels.room(':channelId'), window.location.pathname);
                if (match?.params.channelId === String(data.channelId)) return;
            }

            const route = resolveInAppPushRoute(data);
            toast.custom(
                toastId => (
                    <InAppNotificationCard
                        title={headline(data.channelName as string | undefined, title)}
                        body={body}
                        onClick={
                            route
                                ? () => {
                                      toast.dismiss(toastId);
                                      void navigateToPush(route);
                                  }
                                : undefined
                        }
                    />
                ),
                { id: IN_APP_PUSH_TOAST_ID, duration: IN_APP_PUSH_DURATION_MS, position: 'top-center' }
            );
        },
        [navigateToPush, userId]
    );

    useOnReceiveNotification(handleReceiveNotification);
};
