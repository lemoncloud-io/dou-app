import { getAppVersionInfo } from '../utils/getAppVersion';

/**
 * Displays version information for both desktop and desktop-web.
 * Shows as a compact badge with full info on hover.
 */
export const VersionInfo = ({ className = '' }: { className?: string }) => {
    const info = getAppVersionInfo();

    if (info.isElectron && info.desktopVersion) {
        return (
            <div className={`flex flex-col gap-1 text-xs text-muted-foreground ${className}`}>
                <div>
                    <span className="font-medium">Desktop:</span> v{info.desktopVersion}
                    {info.platform && <span className="ml-1">({info.platform})</span>}
                </div>
                <div>
                    <span className="font-medium">Web:</span> v{info.desktopWebVersion}
                </div>
            </div>
        );
    }

    return (
        <div className={`text-xs text-muted-foreground ${className}`}>
            <span className="font-medium">Web:</span> v{info.desktopWebVersion}
        </div>
    );
};
