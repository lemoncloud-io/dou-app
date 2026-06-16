import { useGlobalLoader } from '@chatic/shared';

/**
 * Covers the sidebar + main panes (not the cloud rail) while a cloud/place switch
 * is in flight — the switch runs a serial auth handshake (token exchange + socket
 * re-verify) that can take a few seconds, during which the panes would otherwise
 * show the previous cloud frozen with no feedback. Driven by the global loader
 * store that useCloudSwitchFlow / useSelectPlace already set. Positioned against
 * DesktopLayout's relative root, offset past the 68px rail so the rail stays live.
 */
export const SwitchingOverlay = () => {
    const { isLoading, message } = useGlobalLoader();
    if (!isLoading) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            className="absolute inset-y-0 left-[68px] right-0 z-30 flex items-center justify-center bg-background/70 backdrop-blur-sm"
        >
            <div className="flex flex-col items-center gap-3">
                <span className="h-7 w-7 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary motion-reduce:animate-none" />
                {message && <span className="text-caption font-medium text-muted-foreground">{message}</span>}
            </div>
        </div>
    );
};
