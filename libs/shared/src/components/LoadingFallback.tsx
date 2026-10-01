import { useTranslation } from 'react-i18next';

interface LoadingFallbackProps {
    message?: string;
}

/**
 * The screen a sign-in or sign-out hand-off holds while it works, and the Suspense fallback at the
 * root. It can sit here for several seconds, so it says what it is: a `status` region a screen
 * reader names, and three quiet dots so a sighted user can tell a slow start from a stuck one.
 *
 * No logo. The logo belongs to the app's launch splash alone, and a wait in the middle of using the
 * app is not a launch. In apps/web this sits under the `index.html` boot cover at start-up and is
 * never seen there; desktop-web, which has no cover, shows the dots alone while it boots.
 */
export const LoadingFallback: React.FC<LoadingFallbackProps> = ({ message = '' }) => {
    // No Suspense: this is itself the Suspense fallback, and on web `/locales` may still be loading.
    // A missing bundle or key reads as the English default, never as the raw key.
    const { t } = useTranslation(undefined, { useSuspense: false });
    const label = message || t('common.loading', { defaultValue: 'Loading' });

    return (
        <div
            role="status"
            aria-label={label}
            className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center"
        >
            {message && <div className="text-sm text-muted-foreground text-center">{message}</div>}
            <div aria-hidden className={message ? 'mt-5 flex gap-1.5' : 'flex gap-1.5'}>
                {['0s', '0.2s', '0.4s'].map(delay => (
                    <span
                        key={delay}
                        className="size-1.5 rounded-full bg-muted-foreground/40 motion-safe:animate-pulse"
                        style={{ animationDelay: delay }}
                    />
                ))}
            </div>
        </div>
    );
};
