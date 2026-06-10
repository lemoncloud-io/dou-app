import { MapPin } from 'lucide-react';

import { cn } from '@chatic/lib/utils';

interface PlaceChipProps {
    name: string;
    className?: string;
}

/**
 * Names the active place as a compact pill. Used wherever a per-place identity is
 * shown or edited so "this place" is never abstract — the user reads the actual
 * place name and knows the scope of the profile they're viewing/editing.
 */
export const PlaceChip = ({ name, className }: PlaceChipProps) => (
    <span
        className={cn(
            'inline-flex max-w-[16rem] items-center gap-1 rounded-full bg-well px-2 py-0.5 text-caption font-medium text-foreground',
            className
        )}
    >
        <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate">{name}</span>
    </span>
);
