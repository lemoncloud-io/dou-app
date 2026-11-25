import { useMutation } from '@tanstack/react-query';

import { runtime } from '@chatic/runtime-react';
import { hostProfile } from '@chatic/bridges';

export const useDevicePushMute = () => {
    const { device } = runtime.data.useRuntimeRepositories();
    const pushMuted = runtime.settings.useConfigValue<boolean>('ui.pushMuted') ?? false;
    const setPushMuted = (value: boolean) => runtime.settings.set('ui.pushMuted', value, { lane: 'local' });

    const isSupported = !!hostProfile().globals.CHATIC_APP_PLATFORM;

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

    return {
        pushEnabled: !pushMuted,
        setPushEnabled,
        isPending: mutation.isPending,
        isSupported,
        hasFailed: mutation.isError,
    };
};
