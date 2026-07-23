import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { usePreferenceStore } from '../../../stores/usePreferenceStore';

// Push settings are relay-owned (chatic-pushes-api sits behind the relay server), so this write MUST
// target the relay socket even while a cloud slot is active. The data layer routes to `active` by
// default, so the destination is pinned here as a constant — and asserted in the hook test — to keep
// it from silently leaking to the cloud slot. See app-runtime socket/kind-scoped-routing.md.
const PUSH_MUTE_ROUTE = 'relay' as const;

/**
 * Device-global push mute toggle state + writer. There is no server read path for `muted`, so the
 * displayed state comes from a local, optimistic preference (`pushMuted`, default OFF = notifications
 * ON). Each toggle optimistically updates the store, sends device.update-remote over the relay
 * socket, and rolls back with an error toast on failure.
 */
export const useDevicePushMute = () => {
    const { device } = useRuntimeRepositories();
    const { t } = useTranslation();
    const { toast } = useToast();
    const pushMuted = usePreferenceStore(state => state.pushMuted);
    const setPushMuted = usePreferenceStore(state => state.setPushMuted);

    const mutation = useMutation({
        mutationFn: (muted: boolean) => device.updateRemotePushMute(muted, { route: PUSH_MUTE_ROUTE }),
    });

    const setPushEnabled = (enabled: boolean) => {
        const nextMuted = !enabled;
        const prevMuted = pushMuted;
        setPushMuted(nextMuted); // optimistic; the write below is the source of truth
        mutation.mutate(nextMuted, {
            onError: () => {
                setPushMuted(prevMuted); // rollback the optimistic flip
                toast({ title: t('mypage.push.updateFailed'), variant: 'destructive' });
            },
        });
    };

    // ON = notifications received = not muted.
    return { pushEnabled: !pushMuted, setPushEnabled, isPending: mutation.isPending };
};
