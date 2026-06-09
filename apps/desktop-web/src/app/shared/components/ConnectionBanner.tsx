import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import { useWebSocketV2Store } from '@chatic/socket';

/**
 * App-shell connection status bar. The socket's connectionStatus already exists
 * in the store (previously only the debug page read it) — surface it everywhere
 * so a dropped/reconnecting socket is visible regardless of route or open channel.
 * Hidden while healthy (connected + verified).
 */
export const ConnectionBanner = () => {
    const { t } = useTranslation();
    const status = useWebSocketV2Store(s => s.connectionStatus);
    const isVerified = useWebSocketV2Store(s => s.isVerified);

    const offline = status === 'disconnected' || status === 'error';
    const reconnecting = status === 'connecting' || (status === 'connected' && !isVerified);
    if (!offline && !reconnecting) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            className={cn(
                'fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 px-3 py-1 text-caption font-medium',
                offline ? 'bg-destructive text-destructive-foreground' : 'bg-warning/15 text-warning-foreground'
            )}
        >
            {!offline && (
                <span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden />
            )}
            {offline ? t('connection.offline') : t('connection.reconnecting')}
        </div>
    );
};
