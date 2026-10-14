import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Users } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';

import { avatarStyle } from '../../../shared';

/** The everyone row's key. Not a member id: picking it sends `mention.all`, not this. */
export const EVERYONE_MENTION_ID = '@everyone';

/** One pickable mention target (roster member, display-resolved by the host). */
export interface Mentionable {
    id: string;
    /** What is written after the "@": a member's name, or the everyone row's word. */
    name: string;
    thumbnail?: string;
    /** The row that calls the whole channel. Its `name` is the word, its title comes from the locale. */
    everyone?: true;
    /** Other words the row answers to in the list's filter, besides `name`. */
    keywords?: string[];
}

interface MentionAutocompleteProps {
    items: Mentionable[];
    activeIndex: number;
    onSelect: (index: number) => void;
}

/** Floating roster list above the caret while an @-token is being typed. */
export const MentionAutocomplete = ({ items, activeIndex, onSelect }: MentionAutocompleteProps) => {
    const { t } = useTranslation();
    // Keep the keyboard-active row visible while the list scrolls.
    const activeRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);
    return (
        <div
            role="listbox"
            className="scrollbar-thin absolute bottom-full left-0 z-float mb-2 max-h-64 w-64 overflow-y-auto rounded-lg border border-hairline bg-elevated p-1 shadow-overlay"
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
                    {item.everyone ? (
                        <>
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                <Users className="h-3 w-3" aria-hidden />
                            </span>
                            <span className="flex min-w-0 flex-col">
                                <span className="truncate">{t('chat.mention.everyone')}</span>
                                <span className="truncate text-caption text-muted-foreground">
                                    {`@${item.name} · ${t('chat.mention.everyoneHint')}`}
                                </span>
                            </span>
                        </>
                    ) : (
                        <>
                            <Avatar className="h-5 w-5">
                                {item.thumbnail && <AvatarImage src={item.thumbnail} alt={item.name} />}
                                <AvatarFallback className="text-nano font-semibold" style={avatarStyle(item.id)}>
                                    {item.name.charAt(0).toUpperCase() || '?'}
                                </AvatarFallback>
                            </Avatar>
                            <span className="truncate">{item.name}</span>
                        </>
                    )}
                </button>
            ))}
        </div>
    );
};
