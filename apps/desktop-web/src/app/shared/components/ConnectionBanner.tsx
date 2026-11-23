import { useTranslation } from 'react-i18next';
import { useIsMutating } from '@tanstack/react-query';

import { cn } from '@chatic/ui-kit';
import { runtime } from '@chatic/runtime';

export const ConnectionBanner = ({ quiet = false }: { quiet?: boolean }) => {
    const { t } = useTranslation();
    const status = runtime.connection.useConnectivity();
    const isSwitching =
        useIsMutating({ mutationKey: runtime.session.SWITCH_SITE_MUTATION_KEY }) +
            useIsMutating({ mutationKey: runtime.session.SWITCH_CLOUD_MUTATION_KEY }) >
        0;

    const offline = status === 'offline';
    if (isSwitching || status === 'online' || (quiet && !offline)) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            className={cn(
                'flex items-center justify-center gap-2 px-3 py-1 text-caption font-medium',
                offline ? 'bg-destructive text-destructive-foreground' : 'bg-warning/15 text-warning-foreground'
            )}
        >
            {!offline && <span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden />}
            {offline ? t('connection.offline') : t('connection.reconnecting')}
        </div>
    );
};
