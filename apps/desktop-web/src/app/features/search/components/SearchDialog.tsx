import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Hash, Search } from 'lucide-react';

import type { DomainChannel } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

import { formatShortDate, messagePlainText, useListboxNav } from '../../../shared';
import { SEARCH_MAX_CHANNELS, useMessageSearch } from '../hooks';
import { useSearchDialogStore } from '../stores';

const formatTime = formatShortDate;

/** Bold the first occurrence of the query inside the message snippet. */
const highlight = (content: string, query: string): ReactNode => {
    const at = content.toLowerCase().indexOf(query.toLowerCase());
    if (at < 0) return content;
    // Trim long leads so the match is visible inside the row.
    const lead = at > 32 ? `…${content.slice(at - 24, at)}` : content.slice(0, at);
    return (
        <>
            {lead}
            <strong className="font-semibold text-foreground">{content.slice(at, at + query.length)}</strong>
            {content.slice(at + query.length)}
        </>
    );
};

interface SearchDialogProps {
    channels: DomainChannel[];
    onSelect: (channelId: string) => void;
    /**
     * Scroll the feed to one matched message and flash it. Without it a match
     * row can only open its channel, which drops the reader at the latest
     * message instead of the one they searched for.
     */
    onJumpToMessage?: (channelId: string, chatNo: number, threadRootId?: string) => void;
}

/**
 * Mod+Shift+F message search over the local chat cache (see useMessageSearch
 * for scope/limits). Hosted by ChannelList alongside the QuickSwitcher for the
 * same reason: the channel list + select handler already live there. A channel
 * header opens the channel; a match row jumps to that message.
 */
export const SearchDialog = ({ channels, onSelect, onJumpToMessage }: SearchDialogProps) => {
    const { t } = useTranslation();
    const open = useSearchDialogStore(s => s.isOpen);
    const setOpen = useSearchDialogStore(s => s.setOpen);
    const toggleOpen = useSearchDialogStore(s => s.toggle);
    const [query, setQuery] = useState('');
    const { results, isSearching, isTruncated } = useMessageSearch(open ? query : '', channels);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'f' && (e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey) {
                e.preventDefault();
                toggleOpen();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [toggleOpen]);

    useEffect(() => {
        if (open) setQuery('');
    }, [open]);

    const trimmed = query.trim();
    const showEmpty = trimmed.length >= 2 && !isSearching && results.length === 0;

    // One flat option list — each channel header, then its matches — so the
    // arrows walk every result in the order it is drawn.
    type Option = { key: string; channelId: string; chatNo?: number; threadRootId?: string };
    const options: Option[] = results.flatMap(result => {
        const channelId = result.channel.id ?? '';
        return [
            { key: `ch:${channelId}`, channelId },
            ...result.matches.map(chat => ({
                key: `m:${channelId}:${chat.id ?? chat.tempId ?? chat.chatNo}`,
                channelId,
                chatNo: chat.chatNo,
                // A reply lives in its thread panel; the main feed never renders it,
                // so scrolling the feed for it could only fail.
                threadRootId: chat.parentId || undefined,
            })),
        ];
    });

    // A channel header opens the channel; a match row carries its own chatNo, so
    // it scrolls to the matched message rather than the channel's latest one.
    const pick = (option: Option | undefined) => {
        if (option?.channelId) {
            if (option.chatNo != null && onJumpToMessage) {
                onJumpToMessage(option.channelId, option.chatNo, option.threadRootId);
            } else {
                onSelect(option.channelId);
            }
        }
        setOpen(false);
    };
    const nav = useListboxNav(options.length, index => pick(options[index]), `${open}:${trimmed}`);
    const indexOf = (key: string) => options.findIndex(o => o.key === key);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent
                closeLabel={t('common.close')}
                className="top-[15%] max-h-[70vh] translate-y-0 gap-2 overflow-hidden p-2 sm:max-w-lg"
            >
                <DialogTitle className="sr-only">{t('search.title')}</DialogTitle>
                {/* The scope, not the title again: a screen reader announced the same
                    four words twice on open and learned nothing from the second. */}
                <DialogDescription className="sr-only">{t('search.scope')}</DialogDescription>
                <div className="flex items-center gap-2 border-b border-hairline px-2 pb-2">
                    <Search size={16} className="shrink-0 text-muted-foreground" aria-hidden />
                    <input
                        autoFocus
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        {...nav.inputProps}
                        placeholder={t('search.placeholder')}
                        aria-label={t('search.placeholder')}
                        className="flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-placeholder"
                    />
                    {isSearching && (
                        <span
                            role="status"
                            aria-label={t('search.searching')}
                            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground motion-reduce:animate-none"
                        />
                    )}
                </div>
                {trimmed.length < 2 ? (
                    <p className="px-3 py-4 text-center text-caption text-muted-foreground">{t('search.hint')}</p>
                ) : showEmpty ? (
                    // The footer below already states the cache-only scope; saying it here
                    // too made the same caveat the loudest thing in the dialog.
                    <p className="px-3 py-4 text-center text-caption text-foreground">{t('search.noResults')}</p>
                ) : (
                    <div
                        id={nav.listboxId}
                        role="listbox"
                        className="scrollbar-thin flex flex-col gap-2 overflow-y-auto"
                    >
                        {results.map(result => {
                            const channelId = result.channel.id ?? '';
                            const headerIndex = indexOf(`ch:${channelId}`);
                            return (
                                <section key={channelId} role="group" className="flex flex-col">
                                    <button
                                        id={nav.optionId(headerIndex)}
                                        type="button"
                                        role="option"
                                        tabIndex={-1}
                                        aria-selected={headerIndex === nav.activeIndex}
                                        // It looks like a group heading but it is an option:
                                        // picking it opens the channel. Say so, or a screen
                                        // reader hears a heading that answers Enter.
                                        aria-label={t('search.openChannel', {
                                            name: result.channel.name ?? channelId,
                                        })}
                                        onMouseEnter={() => nav.setActiveIndex(headerIndex)}
                                        onClick={() => pick(options[headerIndex])}
                                        className={cn(
                                            'tactile flex items-center gap-1.5 rounded-md px-3 py-1.5 text-left text-caption font-semibold text-foreground transition-colors ease-tactile',
                                            headerIndex === nav.activeIndex ? 'bg-accent' : 'hover:bg-accent/60'
                                        )}
                                    >
                                        <Hash size={12} className="shrink-0 text-muted-foreground" aria-hidden />
                                        <span className="truncate">{result.channel.name ?? result.channel.id}</span>
                                        <span className="ml-auto shrink-0 font-normal tabular-nums text-muted-foreground">
                                            {t('search.matchCount', { count: result.matchCount })}
                                        </span>
                                    </button>
                                    {result.matches.map(chat => {
                                        const index = indexOf(
                                            `m:${channelId}:${chat.id ?? chat.tempId ?? chat.chatNo}`
                                        );
                                        return (
                                            <button
                                                key={chat.id ?? chat.tempId ?? chat.chatNo}
                                                id={nav.optionId(index)}
                                                type="button"
                                                role="option"
                                                tabIndex={-1}
                                                aria-selected={index === nav.activeIndex}
                                                onMouseEnter={() => nav.setActiveIndex(index)}
                                                onClick={() => pick(options[index])}
                                                className={cn(
                                                    'tactile flex items-baseline gap-2 rounded-md py-1 pl-7 pr-3 text-left transition-colors ease-tactile',
                                                    index === nav.activeIndex ? 'bg-accent' : 'hover:bg-accent/60'
                                                )}
                                            >
                                                <span className="min-w-0 flex-1 truncate text-callout text-muted-foreground">
                                                    {highlight(messagePlainText(chat.content), trimmed)}
                                                </span>
                                                <span className="shrink-0 text-micro tabular-nums text-muted-foreground">
                                                    {formatTime(chat.createdAt ?? chat.createdAtMs)}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </section>
                            );
                        })}
                    </div>
                )}
                {/* The search is local and bounded; say so rather than let an empty
                    result read as "this was never said". */}
                {trimmed.length >= 2 && (
                    <p className="border-t border-hairline px-3 pt-2 text-micro text-muted-foreground">
                        {isTruncated
                            ? t('search.scopeLimited', { limit: SEARCH_MAX_CHANNELS, total: channels.length })
                            : t('search.scope')}
                    </p>
                )}
            </DialogContent>
        </Dialog>
    );
};
