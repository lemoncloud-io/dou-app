import { useCallback, useEffect } from 'react';
import { matchPath } from 'react-router-dom';
import { toast } from 'sonner';

import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import type { AppMessageData } from '@chatic/app-messages';

import { useOnReceiveNotification, usePushNavigate } from '../bridge';
import { pushEntryRegistry } from '../runtime/logging/pushEntryRegistry';
import { ROUTES } from '../routes/paths';
import { InAppNotificationCard } from '../ui/components/InAppNotificationCard';
import { IN_APP_PUSH_TOAST_ID, installTransientUiDismissal } from '../ui/transientUi';
import {
    extractPushBannerFields,
    extractPushMessageId,
    resolveInAppPushRoute,
    type InAppPushData,
} from '../utils/resolveInAppPushRoute';

/**
 * Routes that count as "already reading this channel". The thread is one of them: it is the
 * same room seen from a different angle, so a banner for the channel you are replying in is
 * the same interruption the room suppresses — and it fires on your own send round-trip.
 */
const VIEWING_CHANNEL_ROUTES = [ROUTES.channels.room(':channelId'), ROUTES.channels.thread(':channelId', ':rootNo')];

/** Messenger-conventional banner lifetime — long enough to read, short enough to not obstruct. */
const IN_APP_PUSH_DURATION_MS = 5_000;

/**
 * Headline for the banner: the channel's name when known — sender titles baked by the backend are
 * unreliable — else the push's own title. The name is shown as-is: the `#` this used to prefix is
 * a public-channel convention DoU has no equivalent of, and the payload carries no stereo, so it
 * was landing on 1:1 and self rooms too.
 */
const headline = (channelName: string | undefined, title: string | undefined): string => channelName ?? title ?? '';

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
    const { userId } = runtime.session.useSessionIdentity();

    const handleReceiveNotification = useCallback(
        (message: AppMessageData<'OnReceiveNotification'>) => {
            const notification = message.data?.notification;
            const title = notification?.title;
            const body = notification?.body;
            const data: InAppPushData = notification?.data ?? {};
            const messageId = extractPushMessageId(data);

            /**
             * One entry per foreground receipt, carrying the verdict rather than a second entry for
             * it (ADR-0099). This is the app's only always-mounted `OnReceiveNotification`
             * subscriber, so the receipt was previously recorded only while the debug screen
             * happened to be open — and under the wrong tag, with the push's title in it.
             *
             * Never the title or body: a push body is message content (catalog rule 8).
             */
            const record = (presented: boolean, reason?: string) =>
                logger.info('PUSH_EVENT', `push received — ${presented ? 'banner shown' : `suppressed (${reason})`}`, {
                    messageId,
                    presented,
                    reason,
                    hasTitle: !!title,
                    hasBody: !!body,
                });

            if (!title && !body) {
                // Data-only push: the badge consumes it, so there is nothing to show. Recorded all
                // the same — a silent push arriving is exactly what a badge investigation needs.
                record(false, 'silent');
                return;
            }

            // Read through the `payload` merge, never off `data` directly: senders nest these
            // fields, so a raw read silently disarms both rules below (see
            // `extractPushBannerFields`).
            const { ownerId, channelId, channelName, thumbnail } = extractPushBannerFields(data);
            if (userId && ownerId && ownerId === String(userId)) {
                record(false, 'own-message');
                return;
            }

            // The current channel is read from the live pathname (not `useLocation`) so the
            // check sees where the user is at event time, without re-rendering per route.
            if (channelId) {
                const isViewingChannel = VIEWING_CHANNEL_ROUTES.some(
                    pattern => matchPath(pattern, window.location.pathname)?.params.channelId === channelId
                );
                if (isViewingChannel) {
                    // The distinction a bare "no banner appeared" report cannot make: the push DID
                    // arrive and was deliberately folded because the room was already open.
                    record(false, 'viewing-channel');
                    return;
                }
            }

            const route = resolveInAppPushRoute(data);
            record(true);
            toast.custom(
                toastId => (
                    <InAppNotificationCard
                        title={headline(channelName, title)}
                        body={body}
                        avatarUrl={thumbnail}
                        onClick={
                            route
                                ? () => {
                                      toast.dismiss(toastId);
                                      // Hand the push's id to the room this opens, so its entry is
                                      // logged under the same correlation key as the receipt above
                                      // (ADR-0099). Bounded and self-clearing — see the registry.
                                      if (channelId) pushEntryRegistry.begin(channelId, messageId);
                                      logger.info('PUSH_EVENT', 'in-app banner tapped', {
                                          messageId,
                                          channelId,
                                      });
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

    // A banner raised for the screen the reader has just left is about something they are no longer
    // looking at, and tapping it would act on a target chosen five seconds ago. The route observer
    // owns the moment; this connects it to the banner, for as long as the banner can be raised.
    useEffect(installTransientUiDismissal, []);
};
