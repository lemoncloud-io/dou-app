import { ChevronRight, XCircle } from 'lucide-react';

import { useDebugMode } from '../hooks';
import { useDebugStrings } from '../i18n';
import { DEBUG_MENU_SECTIONS } from './screenManifest';
import { DEBUG_SCREEN_ICONS } from './screenIcons';
import { debugOverlayActions } from './overlayStore';

/**
 * Panel home: every screen in the manifest, grouped by section. Icons carry the scanning — 23 rows
 * of same-length Korean/English titles are slow to read by text alone.
 */
export const HomeMenu = () => {
    const { disable } = useDebugMode();
    const strings = useDebugStrings();

    const handleDisable = () => {
        disable();
        debugOverlayActions.close();
    };

    return (
        <div className="px-3 pb-8">
            {DEBUG_MENU_SECTIONS.map(section => (
                <section key={section.section}>
                    <div className="mb-1.5 flex items-center gap-2 px-1 pt-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            {strings.sections[section.section]}
                        </p>
                        <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
                            {section.items.length}
                        </span>
                        <div className="h-px flex-1 bg-border" />
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-border bg-card">
                        {section.items.map(item => {
                            const Icon = DEBUG_SCREEN_ICONS[item.icon];
                            return (
                                <button
                                    key={item.key}
                                    onClick={() => debugOverlayActions.selectScreen(item.key)}
                                    className="group flex w-full items-center gap-3 border-b border-border/60 px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/50"
                                >
                                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:text-foreground">
                                        <Icon size={15} />
                                    </span>
                                    <span className="flex-1 truncate text-[14px] font-medium text-foreground">
                                        {strings.screens[item.key].title}
                                    </span>
                                    <ChevronRight size={16} className="shrink-0 text-muted-foreground/60" />
                                </button>
                            );
                        })}
                    </div>
                </section>
            ))}

            <div className="mt-6 flex justify-center">
                <button
                    type="button"
                    onClick={handleDisable}
                    className="flex items-center gap-1.5 rounded-full border border-destructive/30 px-3 py-1.5 text-[12px] font-medium text-destructive hover:bg-destructive/10"
                >
                    <XCircle size={13} />
                    <span>{strings.panel.disable}</span>
                </button>
            </div>
        </div>
    );
};
