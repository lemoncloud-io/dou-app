import { useTranslation } from 'react-i18next';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MoreHorizontal, Users } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';

interface SortablePlaceItemProps {
    place: MySiteView;
    onSettings: (place: MySiteView) => void;
    onDelete: (place: MySiteView) => void;
    onLeave: (place: MySiteView) => void;
}

export const SortablePlaceItem = ({ place, onSettings, onDelete, onLeave }: SortablePlaceItemProps) => {
    const { t } = useTranslation();
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: place.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const isOwner = place.stereo === 'place';

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                'flex h-[48px] items-center gap-[12px] px-[16px] py-[6px]',
                isDragging && 'z-50 bg-background shadow-lg'
            )}
        >
            {/* Drag Handle */}
            <button
                {...attributes}
                {...listeners}
                className="flex cursor-grab items-center justify-center touch-none active:cursor-grabbing"
            >
                <GripVertical size={20} className="text-muted-foreground" />
            </button>

            {/* Avatar & Name */}
            <div className="flex flex-1 items-center gap-[9px]">
                <div
                    className={cn(
                        'flex h-[36px] w-[36px] items-center justify-center rounded-full border border-border',
                        isOwner ? 'bg-primary' : 'bg-muted'
                    )}
                >
                    <Users size={14} className={isOwner ? 'text-primary-foreground' : 'text-muted-foreground'} />
                </div>
                <div className="flex items-center gap-[4px]">
                    {!isOwner && <Users size={20} className="text-muted-foreground" />}
                    <span className="text-[16px] font-medium tracking-[-0.32px] text-foreground">{place.name}</span>
                </div>
            </div>

            {/* More Menu */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button className="flex items-center justify-center p-1">
                        <MoreHorizontal size={20} className="text-muted-foreground" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="end"
                    className="w-[160px] rounded-[12px] shadow-[0px_0px_6px_0px_rgba(0,0,0,0.13)]"
                >
                    <DropdownMenuItem onClick={() => onSettings(place)} className="cursor-pointer px-[16px] py-[11px]">
                        <span className="text-[16px]">{t('placeOrder.settings')}</span>
                    </DropdownMenuItem>
                    {isOwner ? (
                        <DropdownMenuItem
                            onClick={() => onDelete(place)}
                            className="cursor-pointer px-[16px] py-[11px] text-destructive focus:text-destructive"
                        >
                            <span className="text-[16px]">{t('placeOrder.delete')}</span>
                        </DropdownMenuItem>
                    ) : (
                        <DropdownMenuItem
                            onClick={() => onLeave(place)}
                            className="cursor-pointer px-[16px] py-[11px] text-destructive focus:text-destructive"
                        >
                            <span className="text-[16px]">{t('placeOrder.leave')}</span>
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
};
