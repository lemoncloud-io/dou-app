import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Hash, Search } from 'lucide-react';

import type { DomainChannel } from '@chatic/data';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

import { stripMarkdown } from '../../../shared';
import { useMessageSearch } from '../hooks';

const formatTime = (ms?: number): string => {
    if (!ms) return '';
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

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
}

/**
 * Mod+Shift+F message search over the local chat cache (see useMessageSearch
 * for scope/limits). Hosted by ChannelList alongside the QuickSwitcher for the
 * same reason: the channel list + select handler already live there. Picking a
 * result jumps to its channel (message-level scroll is a later step).
 */
export const SearchDialog = ({ channels, onSelect }: SearchDialogProps) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const { results, isSearching } = useMessageSearch(open ? query : '', channels);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'f' && (e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey) {
                e.preventDefault();
                setOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    useEffect(() => {
        if (open) setQuery('');
    }, [open]);

    const trimmed = query.trim();
    const showEmpty = trimmed.length >= 2 && !isSearching && results.length === 0;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="top-[15%] max-h-[70vh] translate-y-0 gap-2 overflow-hidden p-2 sm:max-w-lg">
                <DialogTitle className="sr-only">{t('search.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('search.title')}</DialogDescription>
                <div className="flex items-center gap-2 border-b border-hairline px-2 pb-2">
                    <Search size={16} className="shrink-0 text-muted-foreground" aria-hidden />
                    <input
                        autoFocus
                        value={query}
                        onChange={e => setQuery(e.target.value)}
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
                    <p className="px-3 py-4 text-center text-caption text-muted-foreground">{t('search.noResults')}</p>
                ) : (
                    <div className="scrollbar-thin flex flex-col gap-2 overflow-y-auto">
                        {results.map(result => {
                            const pickChannel = () => {
                                if (result.channel.id) onSelect(result.channel.id);
                                setOpen(false);
                            };
                            return (
                                <section key={result.channel.id} className="flex flex-col">
                                    <button
                                        type="button"
                                        onClick={pickChannel}
                                        className="focus-ring tactile flex items-center gap-1.5 rounded-md px-3 py-1.5 text-left text-caption font-semibold text-foreground transition-colors ease-tactile hover:bg-accent/60"
                                    >
                                        <Hash size={12} className="shrink-0 text-muted-foreground" aria-hidden />
                                        <span className="truncate">{result.channel.name ?? result.channel.id}</span>
                                        <span className="ml-auto shrink-0 font-normal tabular-nums text-muted-foreground">
                                            {t('search.matchCount', { count: result.matchCount })}
                                        </span>
                                    </button>
                                    {result.matches.map(chat => (
                                        <button
                                            key={chat.id ?? chat.tempId ?? chat.chatNo}
                                            type="button"
                                            onClick={pickChannel}
                                            className="focus-ring tactile flex items-baseline gap-2 rounded-md py-1 pl-7 pr-3 text-left transition-colors ease-tactile hover:bg-accent/60"
                                        >
                                            <span className="min-w-0 flex-1 truncate text-callout text-muted-foreground">
                                                {highlight(stripMarkdown(chat.content ?? ''), trimmed)}
                                            </span>
                                            <span className="shrink-0 text-micro tabular-nums text-muted-foreground">
                                                {formatTime(chat.createdAt ?? chat.createdAtMs)}
                                            </span>
                                        </button>
                                    ))}
                                </section>
                            );
                        })}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};
