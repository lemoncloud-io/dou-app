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

const handleRefresh = (): void => {
    window.location.reload();
};

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
            className={cn(
                'fixed left-0 right-0 top-0 z-[60] animate-in slide-in-from-top duration-300',
                'bg-orange-50 dark:bg-orange-950 border-b border-orange-200 dark:border-orange-800',
                className
            )}
        >
            <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900">
                        <RefreshCw className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div className="text-sm">
                        <p className="font-medium text-orange-800 dark:text-orange-200">
                            {t('version.updateAvailable')}
                        </p>
                        <p className="text-orange-600 dark:text-orange-400">
                            {currentVersion} → {latestVersion ?? t('version.unknown')}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="default"
                        size="sm"
                        onClick={handleRefresh}
                        className="bg-orange-600 hover:bg-orange-700 text-white"
                    >
                        <RefreshCw className="mr-1 h-3 w-3" />
                        {t('version.refresh')}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onDismiss}
                        className="h-8 w-8 text-orange-600 dark:text-orange-400"
                        aria-label={t('common.cancel')}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
};
