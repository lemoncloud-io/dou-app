import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/runtime';
import { hostProfile } from '@chatic/bridges';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { haptics } from '../../../bridge/haptics';

export const useDevicePushMute = () => {
    const { device } = runtime.data.useRuntimeRepositories();
    const { t } = useTranslation();
    const { toast } = useToast();
    const pushMuted = runtime.settings.useConfigValue<boolean>('ui.pushMuted') ?? false;
    const setPushMuted = (value: boolean) => runtime.settings.set('ui.pushMuted', value, { lane: 'local' });

    const isSupported = runtime.push.deviceToken !== null && !!hostProfile().globals.CHATIC_APP_PLATFORM;

    const mutation = useMutation({
        mutationFn: (muted: boolean) => device.updateRemotePushMute(muted),
    });

    const setPushEnabled = (enabled: boolean) => {
        const nextMuted = !enabled;
        const prevMuted = pushMuted;
        setPushMuted(nextMuted);
        mutation.mutate(nextMuted, {
            onSuccess: confirmedMuted => setPushMuted(confirmedMuted),
            onError: () => {
                setPushMuted(prevMuted);
                haptics.play('error');
                toast({ title: t('mypage.push.updateFailed'), variant: 'destructive' });
            },
        });
    };

    return { pushEnabled: !pushMuted, setPushEnabled, isPending: mutation.isPending, isSupported };
};
