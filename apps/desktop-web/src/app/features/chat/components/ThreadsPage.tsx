import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { MessagesSquare } from 'lucide-react';

import type { DomainChannel } from '@chatic/data';
import { cn } from '@chatic/lib/utils';

import {
    PANE_HEADER,
    formatListTime,
    isThreadUnread,
    threadsInScope,
    useMyThreadsStore,
    useNotificationsPanelStore,
    type MyThread,
} from '../../../shared';

interface ThreadsPageProps {
    /** The active cloud: only its threads are listed. */
    cloudId: string;
    /** Loaded channels (active place) — name a card's channel when the record kept no name. */
    channels: DomainChannel[];
    /** Places whose threads are listed — the active place, or every place on the Default Cloud. */
    placeScope: ReadonlySet<string>;
    /** Open the thread in its channel and place — the same open a saved reply uses. */
    onOpen: (channelId: string, chatNo: number | undefined, placeId: string | undefined, rootNo: string) => void;
}

interface ThreadCardProps {
    thread: MyThread;
    channelLabel: string | undefined;
    onOpen: () => void;
}

const ThreadCard = ({ thread, channelLabel, onOpen }: ThreadCardProps) => {
    const { t } = useTranslation();
    const unread = isThreadUnread(thread);
    const where = channelLabel ?? t('threads.dm');
    return (
        <article
            aria-label={
                thread.rootOwnerName
                    ? t('threads.cardLabel', { where, owner: thread.rootOwnerName })
                    : t('threads.cardLabelNoOwner', { where })
            }
            className="flex flex-col gap-2 rounded-xl border border-hairline bg-card px-4 py-3"
        >
            <header className="flex min-w-0 items-center gap-2">
                {unread && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-badge-unread" />}
                <span className={cn('truncate text-caption text-foreground', unread && 'font-semibold')}>
                    {channelLabel ?? t('threads.dm')}
                </span>
                {unread && <span className="sr-only">{t('threads.unread')}</span>}
                <span className="ml-auto shrink-0 text-micro tabular-nums text-muted-foreground">
                    {formatListTime(thread.lastActivityAt)}
                </span>
                <button
                    type="button"
                    onClick={onOpen}
                    className="focus-ring tactile shrink-0 rounded-md px-2 py-1 text-micro font-medium text-foreground transition-colors ease-tactile hover:bg-accent"
                >
                    {t('threads.open')}
                </button>
            </header>
            <div className="flex flex-col gap-0.5">
                {thread.rootOwnerName && (
                    <span className="truncate text-callout font-semibold text-foreground">{thread.rootOwnerName}</span>
                )}
                <p className="line-clamp-3 whitespace-pre-wrap break-words text-callout text-foreground">
                    {thread.rootPreview}
                </p>
            </div>
            {thread.lastReplyPreview && (
                <p className="line-clamp-2 border-t border-hairline pt-2 text-caption text-muted-foreground">
                    <span className="font-semibold text-foreground">{thread.lastReplyOwnerName}</span>{' '}
                    {thread.lastReplyPreview}
                </p>
            )}
        </article>
    );
};

/**
 * The Threads page, in the main pane: the threads I take part in (the device-local my-threads list),
 * unread first, each as its root and newest reply. A card's open hands the thread to the host, whose
 * open closes the page.
 */
export const ThreadsPage = ({ cloudId, channels, placeScope, onOpen }: ThreadsPageProps) => {
    const { t } = useTranslation();
    const threads = useMyThreadsStore(s => s.threads);
    const isScanning = useNotificationsPanelStore(s => s.scanningCid === cloudId);
    const listed = useMemo(() => threadsInScope(threads, cloudId, placeScope), [threads, cloudId, placeScope]);
    const channelById = useMemo(() => new Map(channels.map(channel => [channel.id ?? '', channel])), [channels]);

    const channelLabel = (thread: MyThread): string | undefined => {
        if (thread.channelKind && thread.channelKind !== 'channel') return undefined;
        const name = thread.channelName ?? channelById.get(thread.channelId)?.name;
        return name ? `# ${name}` : undefined;
    };

    return (
        <section aria-label={t('threads.title')} className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
            <header className={`${PANE_HEADER} px-6`}>
                <h1 className="flex min-w-0 items-baseline gap-2 text-heading text-foreground">
                    <span className="truncate">{t('threads.title')}</span>
                    <span className="shrink-0 text-caption tabular-nums text-muted-foreground">{listed.length}</span>
                </h1>
            </header>
            {listed.length === 0 ? (
                <div
                    role="status"
                    className="flex flex-1 flex-col items-center justify-center gap-2 px-8 pb-16 text-center"
                >
                    <span className="mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-primary/[0.16] text-foreground">
                        <MessagesSquare size={28} aria-hidden />
                    </span>
                    <p className="text-heading text-foreground">
                        {isScanning ? t('inbox.scanning') : t('threads.empty')}
                    </p>
                    {!isScanning && (
                        <p className="max-w-xs text-caption text-muted-foreground">{t('threads.emptyHint')}</p>
                    )}
                </div>
            ) : (
                <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-5">
                    <p className="text-micro text-muted-foreground">{t('threads.deviceLocal')}</p>
                    {listed.map(([key, thread]) => (
                        <ThreadCard
                            key={key}
                            thread={thread}
                            channelLabel={channelLabel(thread)}
                            onOpen={() => onOpen(thread.channelId, undefined, thread.placeId, thread.rootNo)}
                        />
                    ))}
                </div>
            )}
        </section>
    );
};
