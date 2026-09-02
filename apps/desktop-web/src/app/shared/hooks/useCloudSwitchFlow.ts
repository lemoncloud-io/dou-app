import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useLogoutCloudSession, useSessionSelection, useSwitchCloudSession } from '@chatic/app-runtime';

import { useSelectedChannelStore } from '../stores';

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
    const { switchCloud: switchCloudSession, isPending: isSwitching } = useSwitchCloudSession();
    const { logoutCloudSession } = useLogoutCloudSession();
    const { selectedCloudId } = useSessionSelection();
    const { t } = useTranslation();
    const { toast } = useToast();

    const switchCloud = useCallback(
        async (cloudId: string) => {
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
                toast({ title: t('cloud.switchFailed'), variant: 'destructive' });
            }
        },
        [switchCloudSession, logoutCloudSession, selectedCloudId, isSwitching, t, toast]
    );

    return { switchCloud, isSwitching };
};
