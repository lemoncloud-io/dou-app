import { Fragment, createElement, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { ToastAction, type ToastActionElement } from '@chatic/ui-kit/components/ui/toast';
import { runtime } from '@chatic/app-runtime';
import { pushCloudIdOf } from '@chatic/data';

import { MobileAppPointer } from '../components/MobileAppPointer';
import { useOwnedCloudIds } from './useCloudCatalog';
import { useSelectedChannelStore } from '../stores';
import { classifyWireError, extractErrorMessage, toastFailure } from '../utils';

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
    const { cloud: cloudRepository } = runtime.data.useRuntimeRepositories();
    const ownedCloudIds = useOwnedCloudIds();
    const { t } = useTranslation();

    // Try again runs the switch as it is when clicked, not as it was when it failed: by
    // then the reader may be on that cloud already, or another switch may be running.
    const latestRef = useRef<(cloudId: string) => Promise<void>>(async () => undefined);
    // `isSwitching` turns on only once the session switch starts, so the invited-cloud recovery
    // awaited ahead of it (a relay round trip for a missing cloud) would let a second click start
    // a second switch. This covers the whole flow.
    const busyRef = useRef(false);
    const switchCloud = useCallback(
        async (requestedCloudId: string): Promise<void> => {
            // Push readers already turn a relay push's `'#'` into the relay's own id. This is the
            // last stop before a delegation, so it reads the sentinel the same way rather than let
            // one that slipped through become `delegate-cloud('#')` and a "cloud not found" toast.
            const cloudId = pushCloudIdOf(requestedCloudId) ?? requestedCloudId;
            if (isSwitching || busyRef.current || cloudId === selectedCloudId) return;

            // Channel ids are cloud-scoped: drop the stale selection up front so no hook still
            // keyed on it fires a cross-cloud request (channel.list-user → 403) at the new socket.
            useSelectedChannelStore.getState().clearChannel();

            busyRef.current = true;
            try {
                if (cloudId === 'default') {
                    await logoutCloudSession();
                    return;
                }
                // Push/reinstall safety net: an invited cloud wiped from the cache
                // has no endpoints to switch with, so re-derive and re-cache them
                // first (no-op when already cached). Best-effort — a revoked grant
                // just leaves the rail as it was, and the switch below still runs
                // to report its own failure. Owned clouds are the catalog's record;
                // an invited row for one would mislabel it. The relay returned above.
                if (cloudId && !ownedCloudIds.has(cloudId)) {
                    try {
                        await runtime.data.recoverInvitedCloudIfMissing(cloudRepository, cloudId);
                    } catch {
                        // Best-effort (see above).
                    }
                }
                await switchCloudSession(cloudId);
            } catch (e) {
                // switchCloud / logoutCloudSession already rolled their own session back on failure.
                logger.error('SESSION', '[CloudSwitchFlow] switchFailed', { error: e });
                const cause = switchCauseKey(e);
                // Try again only where a second attempt can land. A refused or vanished cloud
                // refuses again; a refusal is how a lapsed subscription shows up, and that is
                // renewed in the mobile app, so the toast points there instead.
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
                    // The kit types its action as `ReactElement<typeof ToastAction>` (the
                    // component, not its props), which no created element satisfies.
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
        [switchCloudSession, logoutCloudSession, selectedCloudId, cloudRepository, ownedCloudIds, isSwitching, t]
    );

    latestRef.current = switchCloud;

    return { switchCloud, isSwitching };
};
