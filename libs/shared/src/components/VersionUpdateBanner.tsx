import { useTranslation } from 'react-i18next';

import { RefreshCw } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Button } from '@chatic/ui-kit/components/ui/button';

import type { JSX } from 'react';

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

    const displayLatestVersion = latestVersion ?? t('version.unknown');

    return (
        <div
            className={cn(
                'fixed top-0 left-0 right-0 z-[60] pt-safe-top animate-in slide-in-from-top duration-300',
                className
            )}
        >
            <div className="border-b border-border bg-background px-4 py-3 shadow-md">
                <div className="flex items-center gap-3">
                    {/* Icon */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <RefreshCw className="h-5 w-5 text-primary" />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">
                            {t('version.updateAvailable')} <span className="text-primary">v{displayLatestVersion}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {t('version.currentVersion', {
                                version: currentVersion,
                                defaultValue: `Current: v${currentVersion}`,
                            })}
                        </p>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-3 flex gap-2">
                    <Button onClick={() => window.location.reload()} className="h-11 flex-1">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {t('version.refresh')}
                    </Button>
                    <Button variant="outline" onClick={onDismiss} className="h-11 flex-1">
                        {t('version.later')}
                    </Button>
                </div>
            </div>
        </div>
    );
};
