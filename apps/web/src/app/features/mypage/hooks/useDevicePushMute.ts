import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/app-runtime';
import { hostProfile } from '@chatic/bridges';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';

/**
 * Device-global push mute toggle state + writer. There is no standalone `muted` read endpoint, so
 * the displayed state comes from `ui.pushMuted` (`@chatic/config`, default OFF = notifications ON).
 * Each toggle optimistically writes it, sends device.update-remote (pinned to the relay socket
 * inside the data layer — pushes-api sits behind the relay), then reconciles to the server's
 * authoritative `muted` echo on success (the write doubles as a read) or rolls back with an error
 * toast on failure.
 *
 * `isSupported` mirrors the push-registration gate (useDeviceTokenRegistration): only a native
 * shell (CHATIC_APP_PLATFORM, as the host profile kept it) registers a push device with pushes-api,
 * so outside a shell the write would always 404 — the UI disables the toggle instead. It is the
 * platform rather than the `push` port because that gate is the platform too.
 */
export const useDevicePushMute = () => {
    const { device } = runtime.data.useRuntimeRepositories();
    const { t } = useTranslation();
    const { toast } = useToast();
    const pushMuted = useConfigValue<boolean>('ui.pushMuted') ?? false;
    const setPushMuted = (value: boolean) => config.set('ui.pushMuted', value, { lane: 'local' });

    // Shell globals are injected before the web app boots, so the profile's boot value is stable.
    const isSupported = !!hostProfile().globals.CHATIC_APP_PLATFORM;

    const mutation = useMutation({
        mutationFn: (muted: boolean) => device.updateRemotePushMute(muted),
    });

    const setPushEnabled = (enabled: boolean) => {
        const nextMuted = !enabled;
        const prevMuted = pushMuted;
        setPushMuted(nextMuted); // optimistic; the server echo below is the source of truth
        mutation.mutate(nextMuted, {
            onSuccess: confirmedMuted => setPushMuted(confirmedMuted), // reconcile to the server value
            onError: () => {
                setPushMuted(prevMuted); // rollback the optimistic flip
                toast({ title: t('mypage.push.updateFailed'), variant: 'destructive' });
            },
        });
    };

    // ON = notifications received = not muted.
    return { pushEnabled: !pushMuted, setPushEnabled, isPending: mutation.isPending, isSupported };
};
