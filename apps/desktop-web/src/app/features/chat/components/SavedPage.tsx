import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Bookmark, FileText, Film, Image, Paperclip, type LucideIcon } from 'lucide-react';

import type { ChatAttachmentKind, DomainChannel, DomainPlace } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';

import {
    Hint,
    PANE_HEADER,
    attachmentLabel,
    avatarStyle,
    formatListTime,
    useSavedItemsStore,
    useSavedPageStore,
    type SavedAttachment,
    type SavedItem,
} from '../../../shared';
import { formatFileSize, isDmBucket } from '../utils';
import { FILTER_CHIP, filterChipTone } from './filterChip';
import { SOURCE_ICON } from './notifications/NotificationCard';

const SAVED_FILTERS = ['all', 'messages', 'files'] as const;
type SavedFilter = (typeof SAVED_FILTERS)[number];

/** A message saved with any attachment is a file — a photo with a caption included. */
const isInFilter = (item: SavedItem, filter: SavedFilter): boolean =>
    filter === 'all' || (filter === 'files') === !!item.attachment;

const KIND_ICON: Record<ChatAttachmentKind, LucideIcon> = {
    image: Image,
    video: Film,
    file: FileText,
    mixed: Paperclip,
};

/** The file tile under a saved message: the first attachment by name, its type and size. */
const AttachmentTile = ({ attachment }: { attachment: SavedAttachment }) => {
    const KindIcon = KIND_ICON[attachment.kind];
    const extension = attachment.name?.includes('.') ? attachment.name.split('.').pop()?.toUpperCase() : undefined;
    const meta = [
        extension,
        attachment.size !== undefined ? formatFileSize(attachment.size) : undefined,
        // A named first file stands for several: say how many there are.
        attachment.name && attachment.count > 1 ? attachmentLabel(attachment) : undefined,
    ].filter(Boolean);
    return (
        <span className="flex w-fit max-w-full items-center gap-2.5 rounded-lg border border-hairline bg-background py-2 pl-2 pr-3.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-well text-muted-foreground">
                <KindIcon size={16} aria-hidden />
            </span>
            <span className="flex min-w-0 flex-col">
                <span className="truncate text-caption font-medium text-foreground">
                    {attachment.name ?? attachmentLabel(attachment)}
                </span>
                {meta.length > 0 && <span className="truncate text-micro text-muted-foreground">{meta.join(' · ')}</span>}
            </span>
        </span>
    );
};

interface SavedCardProps {
    item: SavedItem;
    source: 'channel' | 'dm' | 'thread';
    /** `# channel`, and the place when it is not the current one; absent when neither is known. */
    where?: string;
    /** The card last opened from this page: the message the reader went to. */
    isCurrent: boolean;
    onOpen: () => void;
    onRemove: () => void;
}

const SavedCard = ({ item, source, where, isCurrent, onOpen, onRemove }: SavedCardProps) => {
    const { t } = useTranslation();
    const SourceIcon = SOURCE_ICON[source];
    // A file-only message was saved with its attachment's name for a line; the tile already says it.
    const body = item.attachment && item.content === attachmentLabel(item.attachment) ? '' : item.content;
    return (
        <article
            className={cn(
                'relative rounded-xl border transition-colors ease-tactile',
                isCurrent ? 'border-primary-ink/40 bg-accent' : 'border-hairline bg-elevated hover:bg-accent/60'
            )}
        >
            <button
                type="button"
                aria-current={isCurrent || undefined}
                onClick={onOpen}
                className="focus-ring flex w-full items-start gap-3 rounded-xl p-4 pr-14 text-left"
            >
                <Avatar className="h-9 w-9 shrink-0">
                    {item.avatar && <AvatarImage src={item.avatar} alt={item.ownerName} />}
                    <AvatarFallback
                        className="text-callout font-semibold"
                        style={avatarStyle(item.colorSeed ?? item.ownerName)}
                    >
                        {item.ownerName.charAt(0).toUpperCase() || '?'}
                    </AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex min-w-0 items-center gap-1.5 text-micro text-muted-foreground">
                        <span className="flex shrink-0 items-center gap-0.5 rounded-md border border-hairline px-1.5 py-px font-medium text-foreground">
                            <SourceIcon size={11} aria-hidden />
                            {t(`inbox.source.${source}`)}
                        </span>
                        {where && <span className="truncate text-foreground">{where}</span>}
                        <span aria-hidden>·</span>
                        <span className="shrink-0">{t('saved.savedAt', { time: formatListTime(item.savedAt) })}</span>
                    </span>
                    <span className="flex items-baseline gap-2">
                        <span className="truncate text-callout font-semibold text-foreground">{item.ownerName}</span>
                        {item.sentAt !== undefined && (
                            <span className="shrink-0 text-micro tabular-nums text-muted-foreground">
                                {formatListTime(item.sentAt)}
                            </span>
                        )}
                    </span>
                    {body && (
                        <span className="line-clamp-3 whitespace-pre-wrap break-words text-callout text-foreground">
                            {body}
                        </span>
                    )}
                    {item.attachment && <AttachmentTile attachment={item.attachment} />}
                </span>
            </button>
            <Hint label={t('saved.remove')}>
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label={t('saved.remove')}
                    className="focus-ring tactile absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors ease-tactile hover:bg-accent"
                >
                    <Bookmark size={16} aria-hidden className="fill-current" />
                </button>
            </Hint>
        </article>
    );
};

interface SavedPageProps {
    /** Loaded channels (active place) — name a card's channel and tell a DM from a channel. */
    channels: DomainChannel[];
    /** Places in the active cloud — name the place of a card saved elsewhere. */
    places: DomainPlace[];
    currentPlaceId?: string;
    /** Jump to the saved message: select its place + channel, then scroll to it
     *  (or open the thread panel when it's a reply — 4th arg = root chatNo string). */
    onSelect: (channelId: string, chatNo?: number, placeId?: string, threadRootId?: string) => void;
}

/**
 * The Saved items page, in the main pane: device-local saved messages newest first, filtered to all,
 * messages or files. A card opens its message (the host's open closes the page); its bookmark unsaves it.
 */
export const SavedPage = ({ channels, places, currentPlaceId, onSelect }: SavedPageProps) => {
    const { t } = useTranslation();
    const openedId = useSavedPageStore(s => s.openedId);
    const markOpened = useSavedPageStore(s => s.markOpened);
    const items = useSavedItemsStore(s => s.items);
    const remove = useSavedItemsStore(s => s.remove);
    const [filter, setFilter] = useState<SavedFilter>('all');

    const sorted = useMemo(() => Object.values(items).sort((a, b) => b.savedAt - a.savedAt), [items]);
    const shown = sorted.filter(item => isInFilter(item, filter));
    const channelById = useMemo(() => new Map(channels.map(channel => [channel.id ?? '', channel])), [channels]);

    const sourceOf = (item: SavedItem): SavedCardProps['source'] => {
        if (item.parentId) return 'thread';
        const channel = channelById.get(item.channelId);
        return channel && isDmBucket(channel) ? 'dm' : 'channel';
    };
    const whereOf = (item: SavedItem, source: SavedCardProps['source']): string | undefined => {
        const channelName = source === 'dm' ? undefined : channelById.get(item.channelId)?.name;
        const elsewhere =
            item.placeId && item.placeId !== currentPlaceId
                ? (places.find(place => place.id === item.placeId)?.name ?? t('saved.otherPlace'))
                : undefined;
        return [channelName && `# ${channelName}`, elsewhere].filter(Boolean).join(' · ') || undefined;
    };

    return (
        <section aria-label={t('saved.title')} className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
            <header className={`${PANE_HEADER} px-6`}>
                <h1 className="flex min-w-0 items-baseline gap-2 text-heading text-foreground">
                    <span className="truncate">{t('saved.title')}</span>
                    <span className="shrink-0 text-caption tabular-nums text-muted-foreground">{sorted.length}</span>
                </h1>
                <div role="group" aria-label={t('saved.filterLabel')} className="flex shrink-0 items-center gap-1.5">
                    {SAVED_FILTERS.map(key => (
                        <button
                            key={key}
                            type="button"
                            aria-pressed={filter === key}
                            disabled={sorted.length === 0}
                            onClick={() => setFilter(key)}
                            className={cn(FILTER_CHIP, filterChipTone(filter === key))}
                        >
                            {t(`saved.filter.${key}`)}
                        </button>
                    ))}
                </div>
            </header>
            {sorted.length === 0 ? (
                <div
                    role="status"
                    className="flex flex-1 flex-col items-center justify-center gap-2 px-8 pb-16 text-center"
                >
                    <span className="mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-primary/[0.16] text-foreground">
                        <Bookmark size={28} aria-hidden />
                    </span>
                    <p className="text-heading text-foreground">{t('saved.empty')}</p>
                    <p className="max-w-xs text-caption text-muted-foreground">{t('saved.emptyHint')}</p>
                </div>
            ) : (
                <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-5">
                    <p className="text-micro text-muted-foreground">{t('saved.deviceLocal')}</p>
                    {shown.length === 0 ? (
                        <p role="status" className="py-8 text-center text-caption text-muted-foreground">
                            {t(`saved.noneIn.${filter}`)}
                        </p>
                    ) : (
                        shown.map(item => {
                            const source = sourceOf(item);
                            return (
                                <SavedCard
                                    key={item.id}
                                    item={item}
                                    source={source}
                                    where={whereOf(item, source)}
                                    isCurrent={item.id === openedId}
                                    onOpen={() => {
                                        markOpened(item.id);
                                        // The host's open closes the page — not here, so a click it
                                        // refuses (a place switch running) leaves the page in place.
                                        onSelect(item.channelId, item.chatNo, item.placeId, item.parentId);
                                    }}
                                    onRemove={() => remove(item.id)}
                                />
                            );
                        })
                    )}
                </div>
            )}
        </section>
    );
};
