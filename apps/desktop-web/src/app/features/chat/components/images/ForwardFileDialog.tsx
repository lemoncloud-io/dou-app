import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Hash, Search, User } from 'lucide-react';
import { create } from 'zustand';

import { runtime } from '@chatic/app-runtime';
import { RELAY_CLOUD_ID, type DomainChannel } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { xhrPut } from '@chatic/runtime-web';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { fetchFileBytes } from '../../utils';
import { rankChannels } from '../QuickSwitcher';
import { channelKind, toastFailure, useChannelLabels, useLastChannelStore, useListboxNav } from '../../../../shared';

/** A sent file to forward: where its bytes are, and what it is called and typed as. */
export interface ForwardRequest {
    url: string;
    name: string;
    contentType?: string;
}

/** One forward under way: the file, and the channel it goes to. */
interface ForwardJob {
    id: number;
    file: ForwardRequest;
    cid: string;
    channelId: string;
    label: string;
}

interface ForwardFileState {
    /** The file whose channel picker is open. */
    request: ForwardRequest | null;
    jobs: ForwardJob[];
    open: (request: ForwardRequest) => void;
    close: () => void;
    /** Closes the picker and starts sending the file to `channel`. */
    send: (channel: { cid: string; channelId: string; label: string }) => void;
    done: (id: number) => void;
}

let nextJob = 0;
/** Jobs whose send has begun; outlives a remount of the component that runs it. */
const startedJobs = new Set<number>();

/**
 * "Forward" from a file's More menu. The picker and the sends live beside the channel list, not in the
 * row: a send outlives the row it was asked from, which the feed may unmount.
 */
export const useForwardFileStore = create<ForwardFileState>((set, get) => ({
    request: null,
    jobs: [],
    open: request => set({ request }),
    close: () => set({ request: null }),
    send: channel => {
        const file = get().request;
        if (!file) return;
        set(state => ({ request: null, jobs: [...state.jobs, { id: ++nextJob, file, ...channel }] }));
    },
    done: id => set(state => ({ jobs: state.jobs.filter(job => job.id !== id) })),
}));

/**
 * The forward picker and the forwards under way, for the channels of the place on screen — the same
 * list the quick switcher offers. The server has no forward of its own, so a forward is the file
 * fetched and sent again as a new message in the channel picked, by the reader.
 */
export const ForwardFileHost = ({ channels }: { channels: DomainChannel[] }) => {
    const request = useForwardFileStore(s => s.request);
    const jobs = useForwardFileStore(s => s.jobs);
    const close = useForwardFileStore(s => s.close);
    // The picker lists this place's channels: one left open as the place changes would offer the new
    // place's channels for a file of the old one.
    useEffect(() => close, [close]);
    return (
        <>
            {request && <ForwardFileDialog channels={channels} file={request} />}
            {jobs.map(job => (
                <ForwardSend key={job.id} job={job} />
            ))}
        </>
    );
};

const ForwardFileDialog = ({ channels, file }: { channels: DomainChannel[]; file: ForwardRequest }) => {
    const { t } = useTranslation();
    const close = useForwardFileStore(s => s.close);
    const send = useForwardFileStore(s => s.send);
    const [query, setQuery] = useState('');
    const recent = useLastChannelStore(s => s.recent);
    const labelOf = useChannelLabels(channels);
    const results = useMemo(
        () => rankChannels(channels, query, recent, labelOf).filter(channel => channel.id),
        [channels, query, recent, labelOf]
    );
    const pick = (index: number) => {
        const channel = results[index];
        if (!channel?.id) return;
        send({ cid: channel.cid || RELAY_CLOUD_ID, channelId: channel.id, label: labelOf(channel) });
    };
    const nav = useListboxNav(results.length, pick, query);

    return (
        <Dialog open onOpenChange={open => !open && close()}>
            <DialogContent
                closeLabel={t('common.close')}
                className="top-[20%] max-h-[calc(80dvh-1rem)] translate-y-0 gap-2 p-2 sm:max-w-md"
            >
                <DialogTitle className="px-2 pt-1 text-callout font-semibold">
                    {t('chat.file.forwardTitle', { name: file.name })}
                </DialogTitle>
                <DialogDescription className="sr-only">{t('chat.file.forwardHint')}</DialogDescription>
                <div className="flex items-center gap-2 border-b border-hairline px-2 pb-2">
                    <Search size={16} className="shrink-0 text-muted-foreground" aria-hidden />
                    <input
                        autoFocus
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        {...nav.inputProps}
                        placeholder={t('chat.file.forwardSearch')}
                        aria-label={t('chat.file.forwardSearch')}
                        className="flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-placeholder"
                    />
                </div>
                {results.length === 0 ? (
                    <p className="px-3 py-4 text-center text-caption text-muted-foreground">
                        {t('switcher.noMatches')}
                    </p>
                ) : (
                    <ul id={nav.listboxId} role="listbox" className="flex flex-col overflow-y-auto">
                        {results.map((channel, index) => (
                            <li key={channel.id}>
                                <button
                                    id={nav.optionId(index)}
                                    type="button"
                                    role="option"
                                    tabIndex={-1}
                                    aria-selected={index === nav.activeIndex}
                                    onMouseEnter={() => nav.setActiveIndex(index)}
                                    onClick={() => pick(index)}
                                    className={cn(
                                        'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-callout transition-colors ease-tactile',
                                        index === nav.activeIndex
                                            ? 'bg-accent text-foreground'
                                            : 'text-muted-foreground hover:bg-accent/60'
                                    )}
                                >
                                    {channelKind(channel) === 'channel' ? (
                                        <Hash size={14} className="shrink-0" aria-hidden />
                                    ) : (
                                        <User size={14} className="shrink-0" aria-hidden />
                                    )}
                                    <span className="truncate">{labelOf(channel)}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </DialogContent>
        </Dialog>
    );
};

/**
 * One forward: fetches the file and sends it to its channel as the reader's own new message. Keyed by
 * the job, so the send is bound to that channel however the screen moves meanwhile; the row it writes
 * shows in that channel as any send's does.
 */
const ForwardSend = ({ job }: { job: ForwardJob }) => {
    const { t } = useTranslation();
    const done = useForwardFileStore(s => s.done);
    // Not the room's screen: the target room may be open beside it, and its rows are that screen's.
    const { sendImages } = runtime.data.useSendImages({
        cid: job.cid,
        channelId: job.channelId,
        put: xhrPut,
        attach: false,
    });
    useEffect(() => {
        // Once per job, claimed outside the component: the host remounts whenever the channel list
        // changes shape (loading, a filter with no match), and a remounted send must not send again.
        if (startedJobs.has(job.id)) return;
        startedJobs.add(job.id);
        const { file } = job;
        void (async () => {
            try {
                const bytes = await fetchFileBytes(file.url);
                // Said as it starts, not as it ends: an upload that fails still settles, and shows as a
                // failed message in that channel rather than here.
                toast({ description: t('chat.file.forwarding', { channel: job.label }) });
                await sendImages([new File([bytes], file.name, { type: file.contentType || bytes.type })]);
            } catch (error) {
                toastFailure(t('chat.file.forwardFailed'), error);
            } finally {
                startedJobs.delete(job.id);
                done(job.id);
            }
        })();
    }, [job, sendImages, done, t]);
    return null;
};
