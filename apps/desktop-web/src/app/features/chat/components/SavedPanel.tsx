import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Bookmark, ChevronRight, Hash, X } from 'lucide-react';

import type { DomainChannel, DomainSite } from '@chatic/data';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';

import { avatarStyle, usePanelWidth, useSavedItemsStore, useSavedPanelStore, type SavedItem } from '../../../shared';

const formatSavedAt = (ms: number): string => {
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

interface SavedRowProps {
    item: SavedItem;
    /** Resolved channel name (current place only); chip is hidden when absent. */
    channelName?: string;
    removeLabel: string;
    onOpen: () => void;
    onRemove: () => void;
}

const SavedRow = ({ item, channelName, removeLabel, onOpen, onRemove }: SavedRowProps) => (
    <div className="group/saved relative flex rounded-md border border-hairline bg-elevated shadow-raised transition-colors ease-tactile hover:bg-accent/60">
        <button
            type="button"
            onClick={onOpen}
            className="focus-ring flex min-w-0 flex-1 items-start gap-2.5 rounded-md p-2.5 text-left"
        >
            <Avatar className="mt-0.5 h-9 w-9 shrink-0 rounded-full">
                {item.avatar && <AvatarImage src={item.avatar} alt={item.ownerName} />}
                <AvatarFallback
                    className="rounded-md text-sm font-semibold"
                    style={avatarStyle(item.colorSeed ?? item.ownerName)}
                >
                    {item.ownerName.charAt(0).toUpperCase() || '?'}
                </AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 pr-7 text-caption text-muted-foreground">
                    <span className="truncate font-medium text-foreground">{item.ownerName}</span>
                    {channelName && (
                        <>
                            <Hash size={10} aria-hidden className="shrink-0" />
                            <span className="truncate">{channelName}</span>
                        </>
                    )}
                    <span className="ml-auto shrink-0 tabular-nums">{formatSavedAt(item.savedAt)}</span>
                </span>
                <span className="line-clamp-2 whitespace-pre-wrap break-words pr-5 text-callout text-muted-foreground">
                    {item.content}
                </span>
            </span>
        </button>
        {/* Jump affordance — surfaces on row hover. */}
        <ChevronRight
            size={16}
            aria-hidden
            className="pointer-events-none absolute bottom-2 right-2 text-muted-foreground opacity-0 transition-opacity ease-tactile group-hover/saved:opacity-100"
        />
        <button
            type="button"
            onClick={onRemove}
            title={removeLabel}
            aria-label={removeLabel}
            className="focus-ring tactile absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity ease-tactile hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/saved:opacity-100"
        >
            <X size={13} />
        </button>
    </div>
);

interface SavedPanelProps {
    /** Loaded channels (active place) — names the saved rows' channel chips. */
    channels: DomainChannel[];
    /** Places in the active cloud — names the place-group headers. */
    places: DomainSite[];
    /** The active place — its group sorts to the top. */
    currentPlaceId?: string;
    /** Jump to the saved message: select its place + channel, then scroll to it
     *  (or open the thread panel when it's a reply — 4th arg = root chatNo string). */
    onSelect: (channelId: string, chatNo?: number, placeId?: string, threadRootId?: string) => void;
}

/**
 * Trailing pane listing device-local saved messages, grouped by place (active
 * place first), newest first within each group. Rows jump to their message; the
 * bookmark toggles off via the row's remove button or the message's toolbar.
 */
export const SavedPanel = ({ channels, places, currentPlaceId, onSelect }: SavedPanelProps) => {
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

    const channelName = (channelId: string): string | undefined => channels.find(c => c.id === channelId)?.name;
    const placeName = (placeId: string): string => places.find(p => p.id === placeId)?.name ?? t('saved.otherPlace');

    // Group newest-first items by place; the active place sorts to the top, the
    // rest keep recency order. Items saved before placeId existed fall under the
    // catch-all "Other workspace" group (key '').
    const groups = useMemo(() => {
        const sorted = Object.values(items).sort((a, b) => b.savedAt - a.savedAt);
        const byPlace = new Map<string, SavedItem[]>();
        for (const item of sorted) {
            const key = item.placeId ?? '';
            const list = byPlace.get(key);
            if (list) list.push(item);
            else byPlace.set(key, [item]);
        }
        // Map keeps first-seen (recency) order; float the active place to the top.
        const keys = [...byPlace.keys()].sort((a, b) => (a === currentPlaceId ? -1 : b === currentPlaceId ? 1 : 0));
        return keys.map(key => ({ key, items: byPlace.get(key) ?? [] }));
    }, [items, currentPlaceId]);

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
            {groups.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-well text-muted-foreground">
                        <Bookmark size={22} />
                    </div>
                    <p className="text-heading text-foreground">{t('saved.empty')}</p>
                    <p className="max-w-xs text-caption text-muted-foreground">{t('saved.emptyHint')}</p>
                </div>
            ) : (
                <div className="scrollbar-thin flex flex-1 flex-col gap-2 overflow-y-auto p-2">
                    <p className="px-2 text-caption text-muted-foreground">{t('saved.deviceLocal')}</p>
                    {groups.map(group => (
                        <div key={group.key || 'none'} className="flex flex-col gap-1">
                            <p className="sticky top-0 z-[1] flex items-center gap-2 bg-background/95 px-2 py-1 text-overline uppercase text-muted-foreground backdrop-blur">
                                <span className="truncate">{placeName(group.key)}</span>
                                <span className="shrink-0 tabular-nums">{group.items.length}</span>
                            </p>
                            {group.items.map(item => (
                                <SavedRow
                                    key={item.id}
                                    item={item}
                                    channelName={channelName(item.channelId)}
                                    removeLabel={t('saved.remove')}
                                    onOpen={() => {
                                        onSelect(item.channelId, item.chatNo, item.placeId, item.parentId);
                                        close();
                                    }}
                                    onRemove={() => remove(item.id)}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </aside>
    );
};
