import { useTranslation } from 'react-i18next';

import { RefreshCw, X } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Button } from '@chatic/ui-kit/components/ui/button';

export interface VersionUpdateBannerProps {
    isVisible: boolean;
    currentVersion: string;
    latestVersion: string | null;
    onDismiss: () => void;
    className?: string;
}

export const VersionUpdateBanner = ({
    isVisible,
    currentVersion,
    latestVersion,
    onDismiss,
    className,
}: VersionUpdateBannerProps): JSX.Element | null => {
    const { t } = useTranslation();

    if (!isVisible) {
        return null;
    }

    return (
        <div
            className={cn('fixed top-0 left-0 right-0 z-[60] p-4 animate-in slide-in-from-top duration-300', className)}
        >
            <div className="mx-auto max-w-2xl rounded-lg border border-neutral-200 bg-white p-4 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900">
                        <RefreshCw className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div className="flex-1">
                        <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                            {t('version.updateAvailable')}
                        </h4>
                        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                            {t('version.newVersionReleased', {
                                latestVersion: latestVersion ?? t('version.unknown'),
                                currentVersion,
                            })}
                        </p>
                        <div className="mt-3 flex gap-2">
                            <Button
                                size="sm"
                                onClick={() => window.location.reload()}
                                className="bg-orange-500 text-white hover:bg-orange-600"
                            >
                                <RefreshCw className="mr-2 h-3 w-3" />
                                {t('version.refresh')}
                            </Button>
                            <Button size="sm" variant="outline" onClick={onDismiss}>
                                {t('version.later')}
                            </Button>
                        </div>
                    </div>
                    <button
                        onClick={onDismiss}
                        className="shrink-0 rounded-md p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        aria-label={t('common.cancel')}
                    >
                        <X className="h-4 w-4 text-neutral-500" />
                    </button>
                </div>
            </div>
        </div>
    );
};
