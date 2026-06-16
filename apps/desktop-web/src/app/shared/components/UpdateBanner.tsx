import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';

import { useAppUpdate } from '../hooks';
import { useUpdateStore } from '../stores';

const BannerButton = ({
    onClick,
    variant = 'solid',
    children,
}: {
    onClick: () => void;
    variant?: 'solid' | 'ghost';
    children: ReactNode;
}) => (
    <button
        type="button"
        onClick={onClick}
        className={cn(
            'rounded px-2 py-0.5 text-caption font-semibold transition-colors',
            variant === 'solid' ? 'bg-current/20 hover:bg-current/30' : 'underline-offset-2 hover:underline'
        )}
    >
        {children}
    </button>
);

/**
 * Desktop auto-update banner (ask-first UX). Top-of-shell bar that walks the user
 * through available → download → restart. Hidden when idle or dismissed. Always
 * mounted (returns null) so the OnUpdateStatus subscription in useAppUpdate stays
 * live regardless of route. No-op in a plain browser (no shell events arrive).
 */
export const UpdateBanner = () => {
    const { t } = useTranslation();
    const { startDownload, restart } = useAppUpdate();
    const status = useUpdateStore(s => s.status);
    const version = useUpdateStore(s => s.version);
    const percent = useUpdateStore(s => s.percent);
    const dismissed = useUpdateStore(s => s.dismissed);
    const dismiss = useUpdateStore(s => s.dismiss);

    if (status === 'idle' || dismissed) return null;

    const isError = status === 'error';

    return (
        <div
            role="status"
            // Percent ticks many times a second — don't let a polite live region read each one.
            aria-live={status === 'downloading' ? 'off' : 'polite'}
            className={cn(
                // z-40 (below ConnectionBanner's z-50) so the transient, more urgent offline bar
                // wins if both happen to show.
                'fixed inset-x-0 top-0 z-40 flex items-center justify-center gap-3 px-3 py-1.5 text-caption font-medium',
                isError ? 'bg-warning text-warning-foreground' : 'bg-primary text-primary-foreground'
            )}
        >
            {status === 'available' && (
                <>
                    <span>{t('update.available', { version })}</span>
                    <BannerButton onClick={startDownload}>{t('update.download')}</BannerButton>
                    <BannerButton variant="ghost" onClick={dismiss}>
                        {t('update.later')}
                    </BannerButton>
                </>
            )}
            {status === 'downloading' && (
                <>
                    <span>{t('update.downloading', { percent })}</span>
                    <span className="h-1 w-24 overflow-hidden rounded-full bg-current/20" aria-hidden>
                        <span
                            className="block h-full bg-current transition-all duration-300"
                            style={{ width: `${percent}%` }}
                        />
                    </span>
                </>
            )}
            {status === 'downloaded' && (
                <>
                    <span>{t('update.downloaded')}</span>
                    <BannerButton onClick={restart}>{t('update.restart')}</BannerButton>
                    <BannerButton variant="ghost" onClick={dismiss}>
                        {t('update.later')}
                    </BannerButton>
                </>
            )}
            {isError && (
                <>
                    <span>{t('update.error')}</span>
                    <BannerButton variant="ghost" onClick={dismiss}>
                        {t('update.dismiss')}
                    </BannerButton>
                </>
            )}
        </div>
    );
};
