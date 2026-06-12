import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Hash, Search } from 'lucide-react';

import type { DomainChannel } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

const MAX_RESULTS = 8;

/** Prefix matches first (Slack-style), then word-boundary/substring matches. */
const rankChannels = (channels: DomainChannel[], query: string): DomainChannel[] => {
    const q = query.trim().toLowerCase();
    if (!q) return channels.slice(0, MAX_RESULTS);
    const label = (c: DomainChannel) => (c.name ?? c.id ?? '').toLowerCase();
    const starts = channels.filter(c => label(c).startsWith(q));
    const includes = channels.filter(c => !label(c).startsWith(q) && label(c).includes(q));
    return [...starts, ...includes].slice(0, MAX_RESULTS);
};

interface QuickSwitcherProps {
    channels: DomainChannel[];
    onSelect: (channelId: string) => void;
}

/**
 * Cmd/Ctrl+K channel jumper (Slack quick switcher). Self-contained like
 * ShortcutsDialog: owns its open state + the global key listener. Hosted by
 * ChannelList because that's where the channel list and select handler already
 * live — the switcher renders nothing until opened.
 */
export const QuickSwitcher = ({ channels, onSelect }: QuickSwitcherProps) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

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

    // Fresh query/selection every time it opens.
    useEffect(() => {
        if (open) {
            setQuery('');
            setActiveIndex(0);
        }
    }, [open]);

    const results = useMemo(() => rankChannels(channels, query), [channels, query]);

    const pick = (channel: DomainChannel) => {
        if (!channel.id) return;
        onSelect(channel.id);
        setOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(i => (results.length ? (i + 1) % results.length : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(i => (results.length ? (i - 1 + results.length) % results.length : 0));
        } else if (e.key === 'Enter' && results[activeIndex]) {
            e.preventDefault();
            pick(results[activeIndex]);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="top-[20%] translate-y-0 gap-2 p-2 sm:max-w-md">
                <DialogTitle className="sr-only">{t('switcher.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('switcher.title')}</DialogDescription>
                <div className="flex items-center gap-2 border-b border-hairline px-2 pb-2">
                    <Search size={16} className="shrink-0 text-muted-foreground" aria-hidden />
                    <input
                        ref={inputRef}
                        autoFocus
                        value={query}
                        onChange={e => {
                            setQuery(e.target.value);
                            setActiveIndex(0);
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder={t('switcher.placeholder')}
                        aria-label={t('switcher.placeholder')}
                        className="flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-placeholder"
                    />
                </div>
                {results.length === 0 ? (
                    <p className="px-3 py-4 text-center text-caption text-muted-foreground">
                        {t('switcher.noMatches')}
                    </p>
                ) : (
                    <ul role="listbox" className="flex flex-col">
                        {results.map((channel, i) => (
                            <li key={channel.id ?? i}>
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={i === activeIndex}
                                    onMouseEnter={() => setActiveIndex(i)}
                                    onClick={() => pick(channel)}
                                    className={cn(
                                        'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-callout transition-colors ease-tactile',
                                        i === activeIndex
                                            ? 'bg-accent text-foreground'
                                            : 'text-muted-foreground hover:bg-accent/60'
                                    )}
                                >
                                    <Hash size={14} className="shrink-0" aria-hidden />
                                    <span className="truncate">{channel.name ?? channel.id}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </DialogContent>
        </Dialog>
    );
};
