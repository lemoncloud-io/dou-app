import { useTranslation } from 'react-i18next';

interface LoadingFallbackProps {
    message?: string;
}

export const LoadingFallback: React.FC<LoadingFallbackProps> = ({ message = '' }) => {
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
