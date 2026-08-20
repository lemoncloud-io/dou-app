import { useEffect, useRef, useState } from 'react';

import { cn } from '@chatic/lib/utils';

import { ProfileAvatar } from '../../foundations/avatar/ProfileAvatar';
import { IconClose } from '../../resources/icons';

export interface SelectedAvatarItem {
    /** Stable identity used as the React key and the `onRemove` argument. */
    id: string;
    /** Display name shown under the avatar. */
    name: string;
    /** Avatar image URL; falls back to the placeholder glyph. */
    avatarSrc?: string;
}

export interface SelectedAvatarRowProps {
    items: SelectedAvatarItem[];
    /** Called with the item id when its remove (X) badge is tapped. */
    onRemove: (id: string) => void;
    /** Accessible label prefix for the remove button (host supplies a localized string). */
    removeLabel?: string;
    className?: string;
}

interface Entry extends SelectedAvatarItem {
    /** True once its id has dropped out of `items` — kept mounted just to play the exit transition. */
    leaving: boolean;
}

/** Must match the exit transition's `duration-*` class below. */
const EXIT_DURATION_MS = 150;

/**
 * Horizontal scroll of selected users — the Figma friend-picker's "selected"
 * strip. Each entry is a circular ProfileAvatar with a small X badge pinned
 * top-right and a truncated name label below. Renders nothing when empty.
 *
 * A newly selected friend slides up into place; removing one (the X badge, or deselecting in
 * the list above) slides it back down while fading, rather than snapping it away — `items`
 * still updates immediately in the parent, so the dropped entry is held here in local state
 * for just the exit transition's duration before it is actually dropped.
 */
export const SelectedAvatarRow = ({ items, onRemove, removeLabel = 'Remove', className }: SelectedAvatarRowProps) => {
    const [entries, setEntries] = useState<Entry[]>(() => items.map(item => ({ ...item, leaving: false })));
    const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

    useEffect(() => {
        const incomingIds = new Set(items.map(item => item.id));
        setEntries(prev => {
            const next: Entry[] = [];
            for (const entry of prev) {
                if (incomingIds.has(entry.id)) {
                    next.push({ ...entry, leaving: false });
                } else if (entry.leaving) {
                    next.push(entry); // Already animating out — leave its timer running.
                } else {
                    next.push({ ...entry, leaving: true });
                    const timer = setTimeout(() => {
                        setEntries(curr => curr.filter(e => e.id !== entry.id));
                        timersRef.current.delete(entry.id);
                    }, EXIT_DURATION_MS);
                    timersRef.current.set(entry.id, timer);
                }
            }
            for (const item of items) {
                if (!prev.some(entry => entry.id === item.id)) next.push({ ...item, leaving: false });
            }
            return next;
        });
    }, [items]);

    // Clears any exit timers still pending if the row itself unmounts mid-animation.
    useEffect(() => {
        const timers = timersRef.current;
        return () => timers.forEach(timer => clearTimeout(timer));
    }, []);

    if (entries.length === 0) return null;

    return (
        <div
            className={cn(
                'flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                className
            )}
        >
            {entries.map(entry => (
                <div
                    key={entry.id}
                    className={cn(
                        'flex w-[60px] shrink-0 flex-col items-center gap-1',
                        entry.leaving
                            ? 'pointer-events-none translate-y-2 opacity-0 transition-all duration-150 ease-in'
                            : 'animate-in slide-in-from-bottom-2 fade-in-0 duration-200 ease-out'
                    )}
                >
                    <div className="relative">
                        <ProfileAvatar src={entry.avatarSrc} size={48} />
                        <button
                            type="button"
                            aria-label={`${removeLabel}: ${entry.name}`}
                            onClick={() => onRemove(entry.id)}
                            className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full border border-background bg-control-idle/90 text-foreground backdrop-blur-[1px] transition-transform active:scale-90"
                        >
                            <IconClose className="size-3" strokeWidth={2.5} />
                        </button>
                    </div>
                    <span className="w-full truncate text-center text-[13px] font-medium leading-[18px] tracking-[-0.15px] text-foreground">
                        {entry.name}
                    </span>
                </div>
            ))}
        </div>
    );
};
