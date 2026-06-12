import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Bookmark, Hash, X } from 'lucide-react';

import type { DomainChannel } from '@chatic/data';

import { usePanelWidth, useSavedItemsStore, useSavedPanelStore } from '../../../shared';

const formatSavedAt = (ms: number): string => {
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

interface SavedPanelProps {
    /** Loaded channels — names the saved rows' channel chips. */
    channels: DomainChannel[];
    /** Jump to the saved message's channel. */
    onSelect: (channelId: string) => void;
}

/**
 * Trailing pane listing device-local saved messages (newest first). Rows jump
 * to their channel; the bookmark itself toggles off via the row's remove
 * button or the message's toolbar.
 */
export const SavedPanel = ({ channels, onSelect }: SavedPanelProps) => {
    const { t } = useTranslation();
    const close = useSavedPanelStore(s => s.close);
    const items = useSavedItemsStore(s => s.items);
    const remove = useSavedItemsStore(s => s.remove);
    const { width, minWidth, maxWidth, panelRef, startResize, resizeByKey } = usePanelWidth({
        storageKey: 'chatic.savedPanel.width',
        defaultWidth: 320,
    });

    // Esc closes the panel (matches the other trailing panes).
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [close]);

    const sorted = useMemo(() => Object.values(items).sort((a, b) => b.savedAt - a.savedAt), [items]);
    const channelName = (channelId: string): string => {
        const channel = channels.find(c => c.id === channelId);
        return channel?.name ?? channelId;
    };

    return (
        <aside
            ref={panelRef}
            style={{ width }}
            className="absolute inset-y-0 right-0 z-30 flex max-w-[85vw] shrink-0 flex-col overflow-hidden border-l border-hairline bg-background shadow-raised xl:relative xl:z-auto xl:max-w-none xl:shadow-none"
        >
            {/* Drag the panel's left edge to resize (arrow keys when focused). */}
            <div
                role="separator"
                aria-orientation="vertical"
                aria-label={t('saved.resize')}
                aria-valuenow={width}
                aria-valuemin={minWidth}
                aria-valuemax={maxWidth}
                tabIndex={0}
                onPointerDown={startResize}
                onKeyDown={resizeByKey}
                className="focus-ring absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize transition-colors ease-tactile hover:bg-primary/40 active:bg-primary/60"
            />
            <header className="flex h-14 shrink-0 items-center justify-between border-b border-hairline px-4">
                <span className="truncate text-title text-foreground">{t('saved.title')}</span>
                <button
                    type="button"
                    onClick={close}
                    title={t('saved.close')}
                    aria-label={t('saved.close')}
                    className="focus-ring tactile flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground"
                >
                    <X size={18} />
                </button>
            </header>
            {sorted.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-well text-muted-foreground">
                        <Bookmark size={22} />
                    </div>
                    <p className="text-heading text-foreground">{t('saved.empty')}</p>
                    <p className="max-w-xs text-caption text-muted-foreground">{t('saved.emptyHint')}</p>
                </div>
            ) : (
                <div className="scrollbar-thin flex flex-1 flex-col gap-1 overflow-y-auto p-2">
                    <p className="px-2 pb-1 text-caption text-muted-foreground">{t('saved.deviceLocal')}</p>
                    {sorted.map(item => (
                        <div
                            key={item.id}
                            className="group/saved relative rounded-md border border-hairline bg-elevated p-2.5 shadow-raised"
                        >
                            <button
                                type="button"
                                onClick={() => {
                                    onSelect(item.channelId);
                                    close();
                                }}
                                className="focus-ring flex w-full flex-col gap-1 rounded text-left"
                            >
                                <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
                                    <Hash size={11} aria-hidden />
                                    <span className="truncate">{channelName(item.channelId)}</span>
                                    <span className="ml-auto shrink-0 tabular-nums">{formatSavedAt(item.savedAt)}</span>
                                </span>
                                <span className="text-callout font-medium text-foreground">{item.ownerName}</span>
                                <span className="line-clamp-3 whitespace-pre-wrap break-words text-callout text-muted-foreground">
                                    {item.content}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => remove(item.id)}
                                title={t('saved.remove')}
                                aria-label={t('saved.remove')}
                                className="focus-ring tactile absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity ease-tactile hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/saved:opacity-100"
                            >
                                <X size={13} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </aside>
    );
};
