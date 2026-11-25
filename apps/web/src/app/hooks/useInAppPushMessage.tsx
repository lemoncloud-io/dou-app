import { useCallback, useEffect } from 'react';
import { matchPath } from 'react-router-dom';
import { toast } from 'sonner';

import { runtime } from '@chatic/runtime-react';
import { logger } from '@chatic/bridges';
import type { AppMessageData } from '@chatic/bridge-messages';

import { useOnReceiveNotification, usePushNavigate } from '../bridge';
import { pushEntryRegistry } from '../runtime/logging/pushEntryRegistry';
import { roomOpenTrace } from '../runtime/perf';
import { ROUTES } from '../routes/paths';
import { InAppNotificationCard } from '../ui/components/InAppNotificationCard';
import { IN_APP_PUSH_TOAST_ID, installTransientUiDismissal } from '../ui/transientUi';
import {
    extractPushBannerFields,
    extractPushMessageId,
    resolveInAppPushRoute,
    type InAppPushData,
} from '../utils/resolveInAppPushRoute';

const VIEWING_CHANNEL_ROUTES = [ROUTES.channels.room(':channelId'), ROUTES.channels.thread(':channelId', ':rootNo')];

const IN_APP_PUSH_DURATION_MS = 5_000;

const headline = (title: string | undefined, channelName: string | undefined): string => title || channelName || '';

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

            const record = (presented: boolean, reason?: string) =>
                logger.info('PUSH_EVENT', `push received — ${presented ? 'banner shown' : `suppressed (${reason})`}`, {
                    messageId,
                    presented,
                    reason,
                    hasTitle: !!title,
                    hasBody: !!body,
                });

            if (!title && !body) {
                record(false, 'silent');
                return;
            }

            const { ownerId, channelId, channelName, thumbnail } = extractPushBannerFields(data);
            if (userId && ownerId && ownerId === String(userId)) {
                record(false, 'own-message');
                return;
            }

            if (channelId) {
                const isViewingChannel = VIEWING_CHANNEL_ROUTES.some(
                    pattern => matchPath(pattern, window.location.pathname)?.params.channelId === channelId
                );
                if (isViewingChannel) {
                    record(false, 'viewing-channel');
                    return;
                }
            }

            const route = resolveInAppPushRoute(data);
            record(true);
            toast.custom(
                toastId => (
                    <InAppNotificationCard
                        title={headline(title, channelName)}
                        body={body}
                        avatarUrl={thumbnail}
                        onClick={
                            route
                                ? () => {
                                      toast.dismiss(toastId);
                                      if (channelId) {
                                          pushEntryRegistry.begin(channelId, messageId);
                                          roomOpenTrace.begin(channelId, 'push_banner');
                                      }
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

    useEffect(installTransientUiDismissal, []);
};
