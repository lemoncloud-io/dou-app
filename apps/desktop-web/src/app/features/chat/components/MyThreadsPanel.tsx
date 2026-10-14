import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronRight, Hash, MessagesSquare, X } from 'lucide-react';

import type { DomainChannel } from '@chatic/data';
import { cn } from '@chatic/lib/utils';

import {
    Hint,
    channelKind,
    hoverReveal,
    isThreadUnread,
    myThreadKey,
    threadsForCloud,
    ResizablePanel,
    useChannelLabels,
    useMyThreadsPanelStore,
    useMyThreadsStore,
    formatListTime,
    PANE_HEADER,
    PANEL_TITLE,
    type ChannelKind,
    type MyThread,
} from '../../../shared';

interface MyThreadRowProps {
    thread: MyThread;
    channel: { kind: ChannelKind; label?: string };
    newReplyLabel: string;
    removeLabel: string;
    /** The row last opened from this pane: the thread the reader went to. */
    isCurrent: boolean;
    onOpen: () => void;
    onRemove: () => void;
}

const MyThreadRow = ({
    thread,
    channel,
    newReplyLabel,
    removeLabel,
    isCurrent,
    onOpen,
    onRemove,
}: MyThreadRowProps) => {
    const unread = isThreadUnread(thread);
    const lastReply = thread.lastReplyOwnerName
        ? `${thread.lastReplyOwnerName}: ${thread.lastReplyPreview}`
        : thread.lastReplyPreview;
    return (
        <div
            className={cn(
                'group/mythread relative flex rounded-md border shadow-raised transition-colors ease-tactile hover:bg-accent/60',
                isCurrent ? 'border-primary-ink/40 bg-accent' : 'border-hairline bg-elevated'
            )}
        >
            <button
                type="button"
                data-thread-key={myThreadKey(thread.cid, thread.channelId, thread.rootNo)}
                aria-current={isCurrent || undefined}
                onClick={onOpen}
                className="focus-ring flex min-w-0 flex-1 items-start gap-2.5 rounded-md p-2.5 text-left"
            >
                <span aria-hidden className="mt-1.5 w-2 shrink-0">
                    {unread && <span className="block h-2 w-2 rounded-full bg-primary" />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 pr-10 text-caption text-muted-foreground">
                        {thread.rootOwnerName && (
                            <span className="truncate font-medium text-foreground">{thread.rootOwnerName}</span>
                        )}
                        {channel.label && (
                            <span className="flex min-w-0 items-center gap-0.5">
                                {channel.kind === 'channel' && <Hash size={10} aria-hidden className="shrink-0" />}
                                <span className="truncate">{channel.label}</span>
                            </span>
                        )}
                        <span className="ml-auto shrink-0 tabular-nums">{formatListTime(thread.lastActivityAt)}</span>
                    </span>
                    <span className="line-clamp-2 whitespace-pre-wrap break-words pr-5 text-callout text-foreground">
                        {thread.rootPreview}
                    </span>
                    {unread && <span className="sr-only">{newReplyLabel}</span>}
                    {/* A new reply is the news, so the reply line carries the weight — not the root above it. */}
                    <span
                        className={cn(
                            'truncate pr-5 text-caption',
                            unread ? 'font-semibold text-foreground' : 'text-muted-foreground'
                        )}
                    >
                        {lastReply}
                    </span>
                </span>
            </button>
            <ChevronRight
                size={16}
                aria-hidden
                className={cn(
                    'pointer-events-none absolute bottom-2 right-2 text-muted-foreground',
                    hoverReveal('mythread')
                )}
            />
            <Hint label={removeLabel}>
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label={removeLabel}
                    className={cn(
                        'focus-ring tactile absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground',
                        hoverReveal('mythread')
                    )}
                >
                    <X size={13} />
                </button>
            </Hint>
        </div>
    );
};

interface MyThreadsPanelProps {
    /** The active cloud — the list shows its threads only. */
    cloudId: string;
    /** The active place — the list shows its channels' threads, and every 1:1's. Absent: the whole cloud's. */
    placeId?: string;
    /** Loaded channels (active place) — names the rows' channel chips. */
    channels: DomainChannel[];
    /** Opens a thread: selects its place + channel, then the thread panel (4th arg = root chatNo). */
    onSelect: (
        channelId: string,
        chatNo: number | undefined,
        placeId: string | undefined,
        threadRootId: string
    ) => void;
}

/**
 * Trailing pane listing the threads this device has seen the user take part in, most recently active
 * first. There is no server thread list, so the pane says it is this device's view; a row with a reply
 * newer than the last look carries a dot and a bold reply line. Opening a row opens that thread, which
 * takes the list's place in the trailing slot once it is there — the list is not closed first, or focus
 * would drop out of the pane while another channel loads. The thread's header leads back, to the same
 * scroll offset and that row.
 */
export const MyThreadsPanel = ({ cloudId, placeId, channels, onSelect }: MyThreadsPanelProps) => {
    const { t } = useTranslation();
    const close = useMyThreadsPanelStore(s => s.close);
    const openedKey = useMyThreadsPanelStore(s => s.openedKey);
    const markOpened = useMyThreadsPanelStore(s => s.markOpened);
    const saveScroll = useMyThreadsPanelStore(s => s.saveScroll);
    const isScanning = useMyThreadsPanelStore(s => s.scanningCid === cloudId);
    const threads = useMyThreadsStore(s => s.threads);
    const markAllSeen = useMyThreadsStore(s => s.markAllSeen);
    const remove = useMyThreadsStore(s => s.remove);
    const list = useMemo(() => threadsForCloud(threads, cloudId, placeId), [threads, cloudId, placeId]);
    const hasUnread = list.some(isThreadUnread);
    const labelOf = useChannelLabels(channels);
    const scrollRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const hasList = list.length > 0;
    const rowButtons = () => Array.from(scrollRef.current?.querySelectorAll<HTMLElement>('[data-thread-key]') ?? []);

    // Coming back lands where the reader left: the offset is put back before paint, and kept as the list
    // goes — once, not on every scroll event.
    useLayoutEffect(() => {
        const list = scrollRef.current;
        if (!list) return;
        list.scrollTop = useMyThreadsPanelStore.getState().scrollTop;
        return () => saveScroll(list.scrollTop);
    }, [hasList, saveScroll]);
    // And by the way back from a thread, focus on the row it was opened from.
    useEffect(() => {
        const { focusOpened, openedKey: key, focusDone } = useMyThreadsPanelStore.getState();
        if (!focusOpened) return;
        focusDone();
        // That row may be gone — removed, evicted — and focus still belongs in the pane.
        (rowButtons().find(row => row.dataset.threadKey === key) ?? closeRef.current)?.focus();
    }, []);

    // A control that goes away under focus hands it on, rather than dropping it to the page: a removed
    // row to its neighbour (or the close button when it was the last), "Mark all read" to close.
    const removeThread = (thread: MyThread) => {
        const rows = rowButtons();
        const at = rows.findIndex(
            row => row.dataset.threadKey === myThreadKey(thread.cid, thread.channelId, thread.rootNo)
        );
        (rows[at + 1] ?? rows[at - 1] ?? closeRef.current)?.focus();
        remove(thread.cid, thread.channelId, thread.rootNo);
    };
    const markAllRead = () => {
        closeRef.current?.focus();
        markAllSeen(cloudId, placeId);
    };

    // A loaded channel names itself the way every other surface does; one that is not loaded — a 1:1
    // listed in another place — is named from what was kept when the thread was recorded.
    const channelOf = (thread: MyThread): { kind: ChannelKind; label?: string } => {
        const loaded = channels.find(c => c.id === thread.channelId);
        if (loaded) return { kind: channelKind(loaded), label: labelOf(loaded) };
        const kind = thread.channelKind ?? 'channel';
        return { kind, label: kind === 'self' ? t('dm.you') : thread.channelName };
    };

    return (
        <ResizablePanel
            storageKey={'chatic.myThreadsPanel.width'}
            resizeLabel={t('myThreads.resize')}
            label={t('myThreads.title')}
            onClose={close}
            className="bg-background"
        >
            <header className={`${PANE_HEADER} px-4`}>
                <span className={PANEL_TITLE}>{t('myThreads.title')}</span>
                <div className="flex shrink-0 items-center gap-1">
                    {hasUnread && (
                        <button
                            type="button"
                            onClick={markAllRead}
                            className="focus-ring tactile rounded-md px-2 py-1 text-caption text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground"
                        >
                            {t('myThreads.markAllRead')}
                        </button>
                    )}
                    <Hint label={t('myThreads.close')}>
                        <button
                            ref={closeRef}
                            type="button"
                            onClick={close}
                            aria-label={t('myThreads.close')}
                            className="focus-ring tactile flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground"
                        >
                            <X size={18} />
                        </button>
                    </Hint>
                </div>
            </header>
            {hasList ? (
                <div ref={scrollRef} className="scrollbar-thin flex flex-1 flex-col gap-1 overflow-y-auto p-2">
                    <p className="px-2 pb-1 text-caption text-muted-foreground">{t('myThreads.deviceLocal')}</p>
                    {list.map(thread => {
                        const key = myThreadKey(thread.cid, thread.channelId, thread.rootNo);
                        return (
                            <MyThreadRow
                                key={key}
                                thread={thread}
                                channel={channelOf(thread)}
                                newReplyLabel={t('myThreads.newReply')}
                                removeLabel={t('myThreads.remove')}
                                isCurrent={key === openedKey}
                                onOpen={() => {
                                    markOpened(key);
                                    onSelect(thread.channelId, undefined, thread.placeId, thread.rootNo);
                                }}
                                onRemove={() => removeThread(thread)}
                            />
                        );
                    })}
                </div>
            ) : (
                <div
                    role="status"
                    aria-live="polite"
                    className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
                >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-well text-muted-foreground">
                        <MessagesSquare size={22} aria-hidden />
                    </div>
                    {isScanning ? (
                        <p className="max-w-xs text-callout text-muted-foreground">{t('myThreads.scanning')}</p>
                    ) : (
                        <>
                            {/* Scoped to a place, "none yet" is only this place's answer — another may hold some. */}
                            <p className="text-heading text-foreground">
                                {t(placeId ? 'myThreads.emptyInPlace' : 'myThreads.empty')}
                            </p>
                            <p className="max-w-xs text-caption text-muted-foreground">{t('myThreads.emptyHint')}</p>
                        </>
                    )}
                    {/* Said here too: an empty list on a second device is not a lost history. */}
                    <p className="max-w-xs text-caption text-muted-foreground">{t('myThreads.deviceLocal')}</p>
                </div>
            )}
        </ResizablePanel>
    );
};
