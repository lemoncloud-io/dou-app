import { useEffect, useRef } from 'react';

import { cn } from '@chatic/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';

import { avatarStyle } from '../../../shared';

/** One pickable mention target (roster member, display-resolved by the host). */
export interface Mentionable {
    id: string;
    name: string;
    thumbnail?: string;
}

interface MentionAutocompleteProps {
    items: Mentionable[];
    activeIndex: number;
    onSelect: (index: number) => void;
}

/** Floating roster list above the caret while an @-token is being typed. */
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
                    // mousedown (not click) so the editor keeps focus through the pick.
                    onMouseDown={e => {
                        e.preventDefault();
                        onSelect(i);
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
