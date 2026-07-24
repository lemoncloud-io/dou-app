import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { usePreferenceStore } from '../../../stores/usePreferenceStore';

/**
 * Device-global push mute toggle state + writer. There is no standalone `muted` read endpoint, so
 * the displayed state comes from a local preference (`pushMuted`, default OFF = notifications ON).
 * Each toggle optimistically updates the store, sends device.update-remote (pinned to the relay
 * socket inside the data layer — pushes-api sits behind the relay), then reconciles to the server's
 * authoritative `muted` echo on success (the write doubles as a read) or rolls back with an error
 * toast on failure.
 *
 * `isSupported` mirrors the push-registration gate (useDeviceTokenRegistration): only a native
 * shell (CHATIC_APP_PLATFORM) registers a push device with pushes-api, so outside a shell the
 * write would always 404 — the UI disables the toggle instead.
 */
export const useDevicePushMute = () => {
    const { device } = useRuntimeRepositories();
    const { t } = useTranslation();
    const { toast } = useToast();
    const pushMuted = usePreferenceStore(state => state.pushMuted);
    const setPushMuted = usePreferenceStore(state => state.setPushMuted);

    // Shell globals are injected before the web app boots, so reading once per render is stable.
    const isSupported = typeof window !== 'undefined' && !!window.CHATIC_APP_PLATFORM;

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
