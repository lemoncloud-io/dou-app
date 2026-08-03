import { useMutation } from '@tanstack/react-query';

import { useRuntimeRepositories } from '@chatic/app-runtime';

import { useNotificationPrefsStore } from '../../../shared/stores';

/**
 * Whether this device accepts push notifications, and the writer that changes it.
 *
 * There is no endpoint that reads the current value — `device.update-remote` is a
 * write, and its response echoes what the server now holds. So the displayed state
 * comes from a local mirror seeded by our own writes: flip it optimistically, then
 * reconcile to the echo on success or roll it back on failure. That echo is the
 * authoritative value, not the boolean we sent; the server may disagree.
 *
 * `isSupported` mirrors the push-registration gate. Only the Electron shell injects
 * `CHATIC_APP_PLATFORM` and registers a device with pushes-api, so in a plain browser
 * there is no device for the write to address and it would always fail. The switch is
 * disabled there, with a reason rather than a silently greyed control.
 *
 * `apps/web` has a hook of the same name and shape. It is not shared: that one reads
 * the mobile-only `usePreferenceStore` and reports failure through a toast this app
 * does not use, so lifting it would mean parameterising both — more work than the
 * fifty lines it would save, and a seam neither app asked for.
 */
export const useDevicePushMute = () => {
    const { device } = useRuntimeRepositories();
    const pushMuted = useNotificationPrefsStore(state => state.pushMuted);
    const setPushMuted = useNotificationPrefsStore(state => state.setPushMuted);

    // Shell globals are injected before the app boots, so one read per render is stable.
    const isSupported = typeof window !== 'undefined' && !!window.CHATIC_APP_PLATFORM;

    const mutation = useMutation({
        mutationFn: (muted: boolean) => device.updateRemotePushMute(muted),
    });

    const setPushEnabled = (enabled: boolean) => {
        const nextMuted = !enabled;
        const previousMuted = pushMuted;
        setPushMuted(nextMuted);
        mutation.mutate(nextMuted, {
            onSuccess: confirmedMuted => setPushMuted(confirmedMuted),
            onError: () => setPushMuted(previousMuted),
        });
    };

    // The switch reads as "receive notifications", which is the inverse of muted.
    // `isError` doubles as the "show the failure line" flag: it is set when the write
    // rejects and cleared the moment the next one starts, which is exactly when the
    // message should disappear.
    return {
        pushEnabled: !pushMuted,
        setPushEnabled,
        isPending: mutation.isPending,
        isSupported,
        hasFailed: mutation.isError,
    };
};
