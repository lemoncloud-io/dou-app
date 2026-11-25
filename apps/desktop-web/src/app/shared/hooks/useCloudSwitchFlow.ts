import { Fragment, createElement, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { ToastAction, type ToastActionElement } from '@chatic/ui-kit';
import { runtime, pushCloudIdOf } from '@chatic/runtime';

import { MobileAppPointer } from '../components/MobileAppPointer';
import { useOwnedCloudIds } from './useCloudCatalog';
import { useSelectedChannelStore } from '../stores';
import { classifyWireError, extractErrorMessage, toastFailure } from '../utils';

export const switchCauseKey = (error: unknown): string => {
    switch (classifyWireError(extractErrorMessage(error))) {
        case 'network':
            return 'cloud.switchCause.network';
        case 'denied':
        case 'expired':
            return 'cloud.switchCause.denied';
        case 'notFound':
            return 'cloud.switchCause.notFound';
        default:
            return 'cloud.switchCause.other';
    }
};

export const useCloudSwitchFlow = () => {
    const { switchCloud: switchCloudSession, isPending: isSwitching } = runtime.session.useSwitchCloudSession();
    const { logoutCloudSession } = runtime.session.useLogoutCloudSession();
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const ownedCloudIds = useOwnedCloudIds();
    const { t } = useTranslation();

    const latestRef = useRef<(cloudId: string) => Promise<void>>(async () => undefined);
    const busyRef = useRef(false);
    const switchCloud = useCallback(
        async (requestedCloudId: string): Promise<void> => {
            const cloudId = pushCloudIdOf(requestedCloudId) ?? requestedCloudId;
            if (isSwitching || busyRef.current || cloudId === selectedCloudId) return;

            useSelectedChannelStore.getState().clearChannel();

            busyRef.current = true;
            try {
                if (cloudId === 'default') {
                    await logoutCloudSession();
                    return;
                }
                if (cloudId && !ownedCloudIds.has(cloudId)) {
                    try {
                        await runtime.data.recoverInvitedCloudIfMissing(cloudId);
                    } catch {
                        // Best-effort (see above).
                    }
                }
                await switchCloudSession(cloudId);
            } catch (e) {
                logger.error('SESSION', '[CloudSwitchFlow] switchFailed', { error: e });
                const cause = switchCauseKey(e);
                const canRetry = cause === 'cloud.switchCause.network' || cause === 'cloud.switchCause.other';
                toastFailure(t('cloud.switchFailed'), e, {
                    detail:
                        cause === 'cloud.switchCause.denied'
                            ? createElement(
                                  Fragment,
                                  null,
                                  t(cause),
                                  createElement(MobileAppPointer, { className: 'mt-1 text-current' })
                              )
                            : t(cause),
                    action: canRetry
                        ? (createElement(
                              ToastAction,
                              { altText: t('cloud.switchRetry'), onClick: () => void latestRef.current(cloudId) },
                              t('cloud.switchRetry')
                          ) as unknown as ToastActionElement)
                        : undefined,
                });
            } finally {
                busyRef.current = false;
            }
        },
        [switchCloudSession, logoutCloudSession, selectedCloudId, ownedCloudIds, isSwitching, t]
    );

    latestRef.current = switchCloud;

    return { switchCloud, isSwitching };
};
