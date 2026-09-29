import { createElement, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { ToastAction, type ToastActionElement } from '@chatic/ui-kit/components/ui/toast';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { runtime } from '@chatic/app-runtime';

import { useSelectedChannelStore } from '../stores';
import { classifyWireError, extractErrorMessage } from '../utils';

/** Why a switch failed, in words: a 400 from a dev cloud used to read the same as a dropped network. */
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

/**
 * Cloud switch (mirrors apps/web `CloudSessionSheet.handleSelectCloud`). `switchCloud` owns the
 * optimistic cid pre-apply + rollback-on-failure; it clears the selected site, so HomePage's
 * auto-select lands the active place on the new cloud's first place once its list loads. (The
 * per-cloud last site is restored on a full refresh via the session's own persistence, but a
 * live switch resets to the first place — same as apps/web.) Returning to the Default Cloud has
 * no delegation token to exchange, so it drops the cloud session (`logoutCloudSession`).
 *
 * `isSwitching` is exposed so the cloud rail / sheet can disable items mid-switch (no full-screen
 * loader — the switch is optimistic).
 */
export const useCloudSwitchFlow = () => {
    const { switchCloud: switchCloudSession, isPending: isSwitching } = runtime.session.useSwitchCloudSession();
    const { logoutCloudSession } = runtime.session.useLogoutCloudSession();
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const { t } = useTranslation();
    const { toast } = useToast();

    // Try again runs the switch as it is when clicked, not as it was when it failed: by
    // then the reader may be on that cloud already, or another switch may be running.
    const latestRef = useRef<(cloudId: string) => Promise<void>>(async () => undefined);
    const switchCloud = useCallback(
        async (cloudId: string): Promise<void> => {
            if (isSwitching || cloudId === selectedCloudId) return;

            // Channel ids are cloud-scoped: drop the stale selection up front so no hook still
            // keyed on it fires a cross-cloud request (channel.list-user → 403) at the new socket.
            useSelectedChannelStore.getState().clearChannel();

            try {
                if (cloudId === 'default') {
                    await logoutCloudSession();
                    return;
                }
                await switchCloudSession(cloudId);
            } catch (e) {
                // switchCloud / logoutCloudSession already rolled their own session back on failure.
                logger.error('SESSION', '[CloudSwitchFlow] switchFailed', { error: e });
                toast({
                    title: t('cloud.switchFailed'),
                    description: t(switchCauseKey(e)),
                    variant: 'destructive',
                    // The kit types its action as `ReactElement<typeof ToastAction>` (the
                    // component, not its props), which no created element satisfies.
                    action: createElement(
                        ToastAction,
                        { altText: t('cloud.switchRetry'), onClick: () => void latestRef.current(cloudId) },
                        t('cloud.switchRetry')
                    ) as unknown as ToastActionElement,
                });
            }
        },
        [switchCloudSession, logoutCloudSession, selectedCloudId, isSwitching, t, toast]
    );

    latestRef.current = switchCloud;

    return { switchCloud, isSwitching };
};
