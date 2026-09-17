import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Hash, Search } from 'lucide-react';

import type { DomainChannel } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

import { useLastChannelStore, useListboxNav } from '../../../shared';

const MAX_RESULTS = 8;

/** A channel in another place of the same cloud, offered with the place it lives in. */
export interface ElsewhereChannel {
    channelId: string;
    name: string;
    placeId: string;
    placeName: string;
}

/**
 * Prefix matches first (Slack-style), then substring matches. With no query the
 * list is what the person opened most recently — it used to be an arbitrary,
 * unsorted first eight — topped up from the rest when there are few recents.
 */
const rankChannels = (channels: DomainChannel[], query: string, recent: string[]): DomainChannel[] => {
    const q = query.trim().toLowerCase();
    if (!q) {
        const byId = new Map(channels.map(c => [c.id, c]));
        const recents = recent.map(id => byId.get(id)).filter((c): c is DomainChannel => !!c);
        const rest = channels.filter(c => !recent.includes(c.id ?? ''));
        return [...recents, ...rest].slice(0, MAX_RESULTS);
    }
    const label = (c: DomainChannel) => (c.name ?? c.id ?? '').toLowerCase();
    const starts = channels.filter(c => label(c).startsWith(q));
    const includes = channels.filter(c => !label(c).startsWith(q) && label(c).includes(q));
    return [...starts, ...includes].slice(0, MAX_RESULTS);
};

interface QuickSwitcherProps {
    channels: DomainChannel[];
    onSelect: (channelId: string) => void;
    /**
     * Channels in the cloud's other places, from the index of places the user has
     * opened. Only searched, never listed with an empty query: the recents list is
     * about where you were, and these are about where you are not.
     */
    elsewhere?: ElsewhereChannel[];
    /** Switch place and open the channel there. */
    onSelectElsewhere?: (channelId: string, placeId: string) => void;
}

/**
 * Cmd/Ctrl+K channel jumper (Slack quick switcher). Self-contained like
 * ShortcutsDialog: owns its open state + the global key listener. Hosted by
 * ChannelList because that's where the channel list and select handler already
 * live — the switcher renders nothing until opened.
 */
export const QuickSwitcher = ({ channels, onSelect, elsewhere = [], onSelectElsewhere }: QuickSwitcherProps) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const recent = useLastChannelStore(s => s.recent);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
                e.preventDefault();
                setOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    // Fresh query every time it opens.
    useEffect(() => {
        if (open) setQuery('');
    }, [open]);

    const results = useMemo(() => rankChannels(channels, query, recent), [channels, query, recent]);

    // Only once the query rules out enough of this place to leave room, and only
    // for names that match: a switcher that always listed the whole cloud would
    // bury the channels a person actually works in.
    const elsewhereResults = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q || !onSelectElsewhere) return [];
        const room = MAX_RESULTS - results.length;
        if (room <= 0) return [];
        const openHere = new Set(channels.map(c => c.id));
        return elsewhere
            .filter(item => !openHere.has(item.channelId) && item.name.toLowerCase().includes(q))
            .slice(0, room);
    }, [elsewhere, query, results.length, channels, onSelectElsewhere]);

    const pick = (index: number) => {
        const here = results[index];
        if (here?.id) {
            onSelect(here.id);
            setOpen(false);
            return;
        }
        const there = elsewhereResults[index - results.length];
        if (!there) return;
        onSelectElsewhere?.(there.channelId, there.placeId);
        setOpen(false);
    };

    const total = results.length + elsewhereResults.length;
    const nav = useListboxNav(total, pick, `${open}:${query}`);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="top-[20%] translate-y-0 gap-2 p-2 sm:max-w-md">
                <DialogTitle className="sr-only">{t('switcher.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('switcher.title')}</DialogDescription>
                <div className="flex items-center gap-2 border-b border-hairline px-2 pb-2">
                    <Search size={16} className="shrink-0 text-muted-foreground" aria-hidden />
                    <input
                        autoFocus
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        {...nav.inputProps}
                        placeholder={t('switcher.placeholder')}
                        aria-label={t('switcher.placeholder')}
                        className="flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-placeholder"
                    />
                </div>
                {total === 0 ? (
                    <p className="px-3 py-4 text-center text-caption text-muted-foreground">
                        {t('switcher.noMatches')}
                    </p>
                ) : (
                    <ul id={nav.listboxId} role="listbox" className="flex flex-col">
                        {results.map((channel, i) => (
                            <li key={channel.id ?? i}>
                                <button
                                    id={nav.optionId(i)}
                                    type="button"
                                    role="option"
                                    tabIndex={-1}
                                    aria-selected={i === nav.activeIndex}
                                    onMouseEnter={() => nav.setActiveIndex(i)}
                                    onClick={() => pick(i)}
                                    className={cn(
                                        'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-callout transition-colors ease-tactile',
                                        i === nav.activeIndex
                                            ? 'bg-accent text-foreground'
                                            : 'text-muted-foreground hover:bg-accent/60'
                                    )}
                                >
                                    <Hash size={14} className="shrink-0" aria-hidden />
                                    <span className="truncate">{channel.name ?? channel.id}</span>
                                </button>
                            </li>
                        ))}
                        {elsewhereResults.map((item, offset) => {
                            const i = results.length + offset;
                            return (
                                <li key={item.channelId}>
                                    <button
                                        id={nav.optionId(i)}
                                        type="button"
                                        role="option"
                                        tabIndex={-1}
                                        aria-selected={i === nav.activeIndex}
                                        onMouseEnter={() => nav.setActiveIndex(i)}
                                        onClick={() => pick(i)}
                                        className={cn(
                                            'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-callout transition-colors ease-tactile',
                                            i === nav.activeIndex
                                                ? 'bg-accent text-foreground'
                                                : 'text-muted-foreground hover:bg-accent/60'
                                        )}
                                    >
                                        <Hash size={14} className="shrink-0" aria-hidden />
                                        <span className="truncate">{item.name}</span>
                                        {/* Which place it is in, because picking it moves the app there. */}
                                        <span className="ml-auto shrink-0 truncate rounded bg-muted px-1.5 py-0.5 text-caption text-muted-foreground">
                                            {item.placeName}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </DialogContent>
        </Dialog>
    );
};
