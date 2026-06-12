import { useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@chatic/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';

import { avatarStyle } from '../../../shared';

/** One pickable mention target (roster member, display-resolved by the host). */
export interface Mentionable {
    id: string;
    name: string;
    thumbnail?: string;
}

/** The "@query" token under the cursor: [start, end) within the composer text. */
export interface MentionToken {
    start: number;
    end: number;
    query: string;
}

/**
 * Find an active @-token ending at the cursor: an "@" that starts a word,
 * followed only by token characters. Returns null when the cursor isn't in one.
 */
export const findMentionToken = (text: string, cursor: number): MentionToken | null => {
    const head = text.slice(0, cursor);
    const at = head.lastIndexOf('@');
    if (at < 0) return null;
    if (at > 0 && !/[\s([{]/.test(head[at - 1])) return null;
    const query = head.slice(at + 1);
    if (!/^[\w.-]*$/.test(query)) return null;
    return { start: at, end: cursor, query };
};

interface UseMentionAutocompleteArgs {
    mentionables: Mentionable[];
    /** Replace the token with the picked mention in the composer text. */
    onApply: (token: MentionToken, picked: Mentionable) => void;
}

/**
 * Composer-side state machine for @-autocomplete: the host reports text/cursor
 * via sync(), routes keys through handleKeyDown (returns true when consumed),
 * and renders <MentionAutocomplete> while open.
 */
export const useMentionAutocomplete = ({ mentionables, onApply }: UseMentionAutocompleteArgs) => {
    const [token, setToken] = useState<MentionToken | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);

    // Every match is listed (the dropdown scrolls) — a silent cap reads as
    // "these are all the members" when it isn't.
    const items = useMemo(() => {
        if (!token) return [];
        const query = token.query.toLowerCase();
        return query ? mentionables.filter(m => m.name.toLowerCase().includes(query)) : mentionables;
    }, [token, mentionables]);

    const open = !!token && items.length > 0;

    const sync = (text: string, cursor: number) => {
        setToken(mentionables.length ? findMentionToken(text, cursor) : null);
        setActiveIndex(0);
    };

    const close = () => setToken(null);

    const select = (picked: Mentionable) => {
        if (!token) return;
        onApply(token, picked);
        setToken(null);
    };

    /** Returns true when the key drove the autocomplete (host must not act on it). */
    const handleKeyDown = (e: React.KeyboardEvent): boolean => {
        if (!open) return false;
        if (e.key === 'ArrowDown') {
            setActiveIndex(i => (i + 1) % items.length);
        } else if (e.key === 'ArrowUp') {
            setActiveIndex(i => (i - 1 + items.length) % items.length);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            select(items[activeIndex]);
        } else if (e.key === 'Escape') {
            close();
        } else {
            return false;
        }
        e.preventDefault();
        return true;
    };

    return { open, items, activeIndex, sync, close, select, handleKeyDown };
};

interface MentionAutocompleteProps {
    items: Mentionable[];
    activeIndex: number;
    onSelect: (picked: Mentionable) => void;
}

/** Floating roster list above the composer while an @-token is being typed. */
export const MentionAutocomplete = ({ items, activeIndex, onSelect }: MentionAutocompleteProps) => {
    // Keep the keyboard-active row visible while the list scrolls.
    const activeRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);
    return (
        <div
            role="listbox"
            className="scrollbar-thin absolute bottom-full left-0 z-20 mb-2 max-h-64 w-64 overflow-y-auto rounded-lg border border-hairline bg-elevated p-1 shadow-overlay"
        >
            {items.map((item, i) => (
                <button
                    key={item.id}
                    ref={i === activeIndex ? activeRef : undefined}
                    type="button"
                    role="option"
                    aria-selected={i === activeIndex}
                    // mousedown (not click) so the textarea keeps focus through the pick.
                    onMouseDown={e => {
                        e.preventDefault();
                        onSelect(item);
                    }}
                    className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-callout transition-colors ease-tactile',
                        i === activeIndex ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60'
                    )}
                >
                    <Avatar className="h-5 w-5 rounded">
                        {item.thumbnail && <AvatarImage src={item.thumbnail} alt={item.name} />}
                        <AvatarFallback className="rounded text-[9px] font-semibold" style={avatarStyle(item.id)}>
                            {item.name.charAt(0).toUpperCase() || '?'}
                        </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{item.name}</span>
                </button>
            ))}
        </div>
    );
};
