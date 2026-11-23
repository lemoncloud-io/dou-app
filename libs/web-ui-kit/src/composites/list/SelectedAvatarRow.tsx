import { useEffect, useRef, useState } from 'react';

import { cn } from '@chatic/ui-kit';

import { ProfileAvatar } from '../../foundations/avatar/ProfileAvatar';
import { IconClose } from '../../resources/icons';

export interface SelectedAvatarItem {
    id: string;
    name: string;
    avatarSrc?: string;
}

export interface SelectedAvatarRowProps {
    items: SelectedAvatarItem[];
    onRemove: (id: string) => void;
    removeLabel?: string;
    className?: string;
}

interface Entry extends SelectedAvatarItem {
    leaving: boolean;
}

const EXIT_DURATION_MS = 150;

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
                    next.push(entry);
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
