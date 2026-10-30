import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Bookmark, FileText, Film, Image, Paperclip, type LucideIcon } from 'lucide-react';

import type { ChatAttachmentKind, DomainChannel, DomainChat, DomainPlace } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';

import {
    Hint,
    PANE_HEADER,
    attachmentLabel,
    avatarStyle,
    formatListTime,
    threadRootNo,
    useSavedItemsStore,
    useSavedPageStore,
    type SavedAttachment,
    type SavedItem,
} from '../../../shared';
import { useIntersecting } from '../hooks/useIntersecting';
import { useSavedCard } from '../hooks/useSavedCard';
import { formatFileSize, isDmBucket } from '../utils';
import { FILTER_CHIP, filterChipTone } from './filterChip';
import { SOURCE_ICON } from './notifications/NotificationCard';
import { ThreadCardMessages } from './ThreadCardMessages';
import { CARD_LINK } from './ThreadsPage';

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

type SavedSource = 'channel' | 'dm' | 'thread';

/** Where a card's message came from, and when it was saved: the line both card kinds lead with. */
const SourceLine = ({ source, where, savedAt }: { source: SavedSource; where?: string; savedAt: number }) => {
    const { t } = useTranslation();
    const SourceIcon = SOURCE_ICON[source];
    return (
        <span className="flex min-w-0 items-center gap-1.5 text-micro text-muted-foreground">
            <span className="flex shrink-0 items-center gap-0.5 rounded-md border border-hairline px-1.5 py-px font-medium text-foreground">
                <SourceIcon size={11} aria-hidden />
                {t(`inbox.source.${source}`)}
            </span>
            {where && <span className="truncate text-foreground">{where}</span>}
            <span aria-hidden>·</span>
            <span className="shrink-0">{t('saved.savedAt', { time: formatListTime(savedAt) })}</span>
        </span>
    );
};

const RemoveButton = ({ onRemove, className }: { onRemove: () => void; className?: string }) => {
    const { t } = useTranslation();
    return (
        <Hint label={t('saved.remove')}>
            <button
                type="button"
                onClick={onRemove}
                aria-label={t('saved.remove')}
                className={cn(
                    'focus-ring tactile flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-foreground transition-colors ease-tactile hover:bg-accent',
                    className
                )}
            >
                <Bookmark size={16} aria-hidden className="fill-current" />
            </button>
        </Hint>
    );
};

interface SavedCardProps {
    item: SavedItem;
    source: SavedSource;
    /** `# channel`, and the place when it is not the current one; absent when neither is known. */
    where?: string;
    /** The card last opened from this page: the message the reader went to. */
    isCurrent: boolean;
    onOpen: () => void;
    onRemove: () => void;
}

const SavedCard = ({ item, source, where, isCurrent, onOpen, onRemove }: SavedCardProps) => {
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
                    <SourceLine source={source} where={where} savedAt={item.savedAt} />
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
            <RemoveButton onRemove={onRemove} className="absolute right-2.5 top-2.5" />
        </article>
    );
};

/** Saved messages drawn as one card: a thread's saved messages, its root included, together; any other alone. */
interface SavedGroup {
    key: string;
    /** Oldest first. */
    items: SavedItem[];
    /** The root's chatNo when the group is a thread. */
    rootNo?: string;
    /** The newest save in the group — the list's order. */
    savedAt: number;
}

const groupSaved = (items: SavedItem[]): SavedGroup[] => {
    const groups = new Map<string, SavedGroup>();
    const threadKey = (item: SavedItem, rootNo: string) => `${item.placeId ?? ''}|${item.channelId}|${rootNo}`;
    for (const item of items) {
        if (!item.parentId) continue;
        const rootNo = threadRootNo(item.parentId);
        const key = threadKey(item, rootNo);
        const group = groups.get(key) ?? { key, items: [], rootNo, savedAt: 0 };
        group.items.push(item);
        groups.set(key, group);
    }
    // A saved root joins its thread's card, so it is not drawn twice.
    for (const item of items) {
        if (item.parentId) continue;
        const thread = item.chatNo !== undefined ? groups.get(threadKey(item, String(item.chatNo))) : undefined;
        if (thread) thread.items.push(item);
        else groups.set(item.id, { key: item.id, items: [item], savedAt: 0 });
    }
    return [...groups.values()]
        .map(group => ({
            ...group,
            items: group.items.sort((a, b) => (a.chatNo ?? Infinity) - (b.chatNo ?? Infinity)),
            savedAt: Math.max(...group.items.map(item => item.savedAt)),
        }))
        .sort((a, b) => b.savedAt - a.savedAt);
};

// A saved message is one the server accepted, so its row never offers Retry or Delete unsent.
const settledOnly = () => undefined;

interface SavedLiveCardProps {
    cloudId: string;
    channel: DomainChannel;
    group: SavedGroup;
    source: SavedSource;
    where?: string;
    isCurrent: boolean;
    onOpen: () => void;
    onRemove: () => void;
    /**
     * Each saved message's snapshot card: all of them until the live messages are read, and instead of
     * the live card when none can be; after it, the ones that could not be read.
     */
    snapshots: { id: string; card: ReactNode }[];
}

/**
 * A Saved page card drawn the way a Threads page card is: the messages' own rows, with their pictures,
 * files and reactions, and a thread's saved replies under its root. Without the rows' Saved tag — every
 * message here is saved.
 */
const SavedLiveCard = ({
    cloudId,
    channel,
    group,
    source,
    where,
    isCurrent,
    onOpen,
    onRemove,
    snapshots,
}: SavedLiveCardProps) => {
    const { t } = useTranslation();
    const ref = useRef<HTMLDivElement>(null);
    // Read a little ahead of the screen, once — the same as a Threads page card.
    const near = useIntersecting(ref, '200px 0px');
    const [read, setRead] = useState(false);
    if (near && !read) setRead(true);
    const state = useSavedCard({
        cid: cloudId,
        channelId: channel.id ?? '',
        ids: group.items.map(item => item.id),
        rootNo: group.rootNo,
        enabled: read,
    });
    // Live once any saved message reads. The root alone is not enough: unless it was saved, a card of it
    // would show nothing that was.
    const live = state.status === 'ready' && state.missing.length < group.items.length ? state : null;
    const rows = (messages: DomainChat[]) => (
        <ThreadCardMessages
            channel={channel}
            messages={messages}
            onRetry={settledOnly}
            onDiscard={settledOnly}
            hideSavedMark
        />
    );

    return (
        <div ref={ref} className="flex flex-col gap-3">
            {live ? (
                <article
                    className={cn(
                        'flex flex-col gap-3 rounded-xl border px-4 py-3 transition-colors ease-tactile',
                        isCurrent ? 'border-primary-ink/40 bg-accent' : 'border-hairline bg-card'
                    )}
                >
                    <header className="flex min-w-0 items-center gap-2">
                        <SourceLine source={source} where={where} savedAt={group.savedAt} />
                        <button
                            type="button"
                            aria-current={isCurrent || undefined}
                            onClick={onOpen}
                            className={cn(CARD_LINK, 'ml-auto')}
                        >
                            {t('threads.open')}
                        </button>
                        <RemoveButton onRemove={onRemove} />
                    </header>
                    {live.root && rows([live.root])}
                    {live.messages.length > 0 &&
                        (group.rootNo ? (
                            <div className="flex flex-col gap-3 border-l-2 border-hairline pl-3">
                                {rows(live.messages)}
                            </div>
                        ) : (
                            rows(live.messages)
                        ))}
                </article>
            ) : (
                snapshots.map(snapshot => snapshot.card)
            )}
            {live && snapshots.filter(snapshot => live.missing.includes(snapshot.id)).map(snapshot => snapshot.card)}
        </div>
    );
};

interface SavedPageProps {
    /** The active cloud — the saved messages of this place are read live from it. */
    cloudId: string;
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
export const SavedPage = ({ cloudId, channels, places, currentPlaceId, onSelect }: SavedPageProps) => {
    const { t } = useTranslation();
    const openedId = useSavedPageStore(s => s.openedId);
    const markOpened = useSavedPageStore(s => s.markOpened);
    const items = useSavedItemsStore(s => s.items);
    const remove = useSavedItemsStore(s => s.remove);
    const [filter, setFilter] = useState<SavedFilter>('all');

    const sorted = useMemo(() => Object.values(items).sort((a, b) => b.savedAt - a.savedAt), [items]);
    const shown = groupSaved(sorted.filter(item => isInFilter(item, filter)));
    const channelById = useMemo(() => new Map(channels.map(channel => [channel.id ?? '', channel])), [channels]);
    // Channel ids repeat across places: only a message saved here can be named from this place's list.
    const channelOf = (item: SavedItem): DomainChannel | undefined =>
        !item.placeId || item.placeId === currentPlaceId ? channelById.get(item.channelId) : undefined;

    const sourceOf = (item: SavedItem): SavedSource => {
        if (item.parentId) return 'thread';
        const channel = channelOf(item);
        return channel && isDmBucket(channel) ? 'dm' : 'channel';
    };
    const whereOf = (item: SavedItem, source: SavedSource): string | undefined => {
        const channelName = source === 'dm' ? undefined : channelOf(item)?.name;
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
                        shown.map(group => {
                            const open = (item: SavedItem) => {
                                markOpened(item.id);
                                // The host's open closes the page — not here, so a click it
                                // refuses (a place switch running) leaves the page in place.
                                onSelect(item.channelId, item.chatNo, item.placeId, item.parentId);
                            };
                            const snapshots = group.items.map(item => {
                                const source = sourceOf(item);
                                return {
                                    id: item.id,
                                    card: (
                                        <SavedCard
                                            key={item.id}
                                            item={item}
                                            source={source}
                                            where={whereOf(item, source)}
                                            isCurrent={item.id === openedId}
                                            onOpen={() => open(item)}
                                            onRemove={() => remove(item.id)}
                                        />
                                    ),
                                };
                            });
                            const lead = group.items[0];
                            // Read live only what was saved in this very place: an item without one may
                            // come from another cloud, whose channel ids mean other rooms.
                            const channel = lead.placeId === currentPlaceId ? channelOf(lead) : undefined;
                            if (!channel) return snapshots.map(snapshot => snapshot.card);
                            const source = group.rootNo ? 'thread' : sourceOf(lead);
                            // The card opens at the message saved last.
                            const latest = group.items.reduce((a, b) => (b.savedAt > a.savedAt ? b : a));
                            return (
                                <SavedLiveCard
                                    key={group.key}
                                    cloudId={cloudId}
                                    channel={channel}
                                    group={group}
                                    source={source}
                                    where={whereOf(lead, source)}
                                    isCurrent={group.items.some(item => item.id === openedId)}
                                    onOpen={() => open(latest)}
                                    onRemove={() => group.items.forEach(item => remove(item.id))}
                                    snapshots={snapshots}
                                />
                            );
                        })
                    )}
                </div>
            )}
        </section>
    );
};
