import { Suspense } from 'react';

import { ChevronLeft, ChevronRight, Minimize2, PictureInPicture2, X, XCircle } from 'lucide-react';

import { DEBUG_MENU_SECTIONS, DEBUG_SCREEN_TITLES } from './debugMenu';
import { DEBUG_SCREEN_COMPONENTS } from './screenRegistry';
import { debugOverlayActions, useDebugOverlayState } from './overlayStore';
import { useDebugMode } from '../hooks';

/**
 * Full-screen debug sheet (web counterpart of the mobile DebugOverlay): a home
 * menu with an internal screen stack. Rendered outside the Router so it works
 * even while the app is stuck booting.
 */
export const ExpandedSheet = () => {
    const { screen } = useDebugOverlayState();
    const { disable } = useDebugMode();

    const title = screen ? DEBUG_SCREEN_TITLES[screen] : 'Debug';
    const Screen = screen ? DEBUG_SCREEN_COMPONENTS[screen] : null;

    const handleDisable = () => {
        disable();
        debugOverlayActions.close();
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-background pt-safe-top pb-safe-bottom">
            <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-border px-1">
                <div className="w-[88px]">
                    {screen && (
                        <button
                            onClick={() => debugOverlayActions.goBack()}
                            className="rounded-full p-[9px]"
                            aria-label="back"
                        >
                            <ChevronLeft size={22} strokeWidth={2} />
                        </button>
                    )}
                </div>
                <span className="flex-1 truncate text-center text-[15px] font-semibold">{title}</span>
                <div className="flex w-[88px] items-center justify-end gap-1 pr-2">
                    {/* Float keeps THIS screen usable over the app; minimize swaps to the observation tabs. */}
                    {screen && (
                        <button
                            onClick={() => debugOverlayActions.float()}
                            className="rounded-full p-[9px] text-muted-foreground"
                            aria-label="float"
                        >
                            <PictureInPicture2 size={18} />
                        </button>
                    )}
                    <button
                        onClick={() => debugOverlayActions.minimize()}
                        className="rounded-full p-[9px] text-muted-foreground"
                        aria-label="minimize"
                    >
                        <Minimize2 size={18} />
                    </button>
                    <button
                        onClick={() => debugOverlayActions.close()}
                        className="rounded-full p-[9px] text-muted-foreground"
                        aria-label="close"
                    >
                        <X size={20} />
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto overscroll-none">
                {Screen ? (
                    <Suspense fallback={<p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>}>
                        <Screen />
                    </Suspense>
                ) : (
                    <HomeMenu onDisable={handleDisable} />
                )}
            </div>
        </div>
    );
};

const HomeMenu = ({ onDisable }: { onDisable: () => void }) => (
    <div className="px-4 pb-6">
        {DEBUG_MENU_SECTIONS.map(section => (
            <div key={section.title} className="mb-2">
                <p className="mb-1 ml-1 mt-5 text-[12px] uppercase text-muted-foreground">{section.title}</p>
                <div className="rounded-[18px] bg-card px-0.5 py-2 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                    {section.items.map(item => (
                        <button
                            key={item.key}
                            onClick={() => debugOverlayActions.selectScreen(item.key)}
                            className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                        >
                            <span className="text-[15px] font-medium text-foreground">{item.title}</span>
                            <ChevronRight size={18} className="text-muted-foreground" />
                        </button>
                    ))}
                </div>
            </div>
        ))}

        <div className="mt-8 flex justify-center">
            <button
                type="button"
                onClick={onDisable}
                className="flex items-center gap-1 text-[13px] font-medium text-destructive"
            >
                <XCircle size={14} />
                <span>Disable Debug Mode</span>
            </button>
        </div>
    </div>
);
