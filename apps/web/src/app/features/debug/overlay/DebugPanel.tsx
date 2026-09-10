import { Suspense } from 'react';

import { ChevronLeft, Maximize2, Minimize2, X } from 'lucide-react';

import { useDebugStrings } from '../i18n';
import { FloatingPanel } from './FloatingPanel';
import { HomeMenu } from './HomeMenu';
import { DEBUG_DOCK_TABS, DEBUG_PANEL_SIZES } from './screenManifest';
import { DEBUG_SCREEN_ICONS } from './screenIcons';
import { DEBUG_SCREEN_COMPONENTS } from './screenRegistry';
import { debugOverlayActions, useDebugOverlayState } from './overlayStore';

/**
 * The whole debug UI: one panel, one navigation. The tab strip is a shortcut to the pinned screens
 * (the ones worth watching while the app is driven); the home menu behind the back control lists
 * every screen. Size is a separate axis — see `overlayStore`.
 *
 * Replaces MiniPanel / FloatingScreen / ExpandedSheet, which were three shells over two catalogs.
 */
export const DebugPanel = () => {
    const { size, screen } = useDebugOverlayState();
    const strings = useDebugStrings();

    const Screen = screen ? DEBUG_SCREEN_COMPONENTS[screen] : null;
    const isMini = size === 'mini';
    const canGrow = size !== DEBUG_PANEL_SIZES[DEBUG_PANEL_SIZES.length - 1];
    const canShrink = size !== DEBUG_PANEL_SIZES[0];

    return (
        <FloatingPanel
            size={size}
            title={
                <span className="flex items-center gap-2">
                    {/* The badge is chrome, and the corner widget has no room to spare for chrome. */}
                    {!isMini && (
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                            debug
                        </span>
                    )}
                    <span className="truncate">{screen ? strings.screens[screen].title : strings.panel.home}</span>
                </span>
            }
            leading={
                screen ? (
                    <button
                        onClick={() => debugOverlayActions.goBack()}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="back"
                    >
                        <ChevronLeft size={isMini ? 15 : 18} />
                    </button>
                ) : null
            }
            actions={
                <>
                    {canShrink && (
                        <button
                            onClick={() => debugOverlayActions.minimize()}
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label="minimize"
                        >
                            <Minimize2 size={13} />
                        </button>
                    )}
                    {canGrow && (
                        <button
                            onClick={() => debugOverlayActions.expand()}
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label="expand"
                        >
                            <Maximize2 size={13} />
                        </button>
                    )}
                    <button
                        onClick={() => debugOverlayActions.close()}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="close"
                    >
                        <X size={isMini ? 14 : 16} />
                    </button>
                </>
            }
        >
            <div
                role="tablist"
                aria-label={strings.panel.tabStrip}
                className={`flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-muted/30 ${
                    isMini ? 'px-1.5 py-1' : 'px-2 py-1.5'
                }`}
            >
                {DEBUG_DOCK_TABS.map(tab => {
                    const Icon = DEBUG_SCREEN_ICONS[tab.icon];
                    const { title, short } = strings.screens[tab.key];
                    const isActive = screen === tab.key;
                    return (
                        <button
                            key={tab.key}
                            role="tab"
                            aria-selected={isActive}
                            aria-label={title}
                            title={title}
                            onClick={() => debugOverlayActions.selectScreen(tab.key)}
                            className={`flex shrink-0 items-center gap-1.5 rounded-lg text-xs transition-colors ${
                                isMini ? 'p-1.5' : 'px-2.5 py-1'
                            } ${
                                isActive
                                    ? 'bg-foreground text-background shadow-sm'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            }`}
                        >
                            <Icon size={13} />
                            {/* Icon-only in the corner widget: labels would push the strip past its width. */}
                            {!isMini && (short ?? title)}
                        </button>
                    );
                })}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
                {Screen ? (
                    <Suspense
                        fallback={
                            <p className="p-6 text-center text-sm text-muted-foreground">{strings.panel.loading}</p>
                        }
                    >
                        <Screen />
                    </Suspense>
                ) : (
                    <HomeMenu />
                )}
            </div>
        </FloatingPanel>
    );
};
