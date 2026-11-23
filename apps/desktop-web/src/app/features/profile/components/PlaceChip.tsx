import { MapPin } from 'lucide-react';

import { cn } from '@chatic/ui-kit';

interface PlaceChipProps {
    name: string;
    className?: string;
}

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
