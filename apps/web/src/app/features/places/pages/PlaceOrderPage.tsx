import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import {
    closestCenter,
    DndContext,
    KeyboardSensor,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronLeft, GripVertical, MoreHorizontal, Users } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';

import { useMyPlaces } from '../../home/hooks/useMyPlaces';

import type { DragEndEvent } from '@dnd-kit/core';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';

interface HeaderProps {
    title: string;
    onBack: () => void;
}

const Header = ({ title, onBack }: HeaderProps) => (
    <header className="flex h-[45px] items-center justify-between px-[6px]">
        <button onClick={onBack} className="flex h-[44px] w-[44px] items-center justify-center rounded-[50px]">
            <ChevronLeft size={24} className="text-foreground" />
        </button>
        <span className="flex-1 text-center text-[16px] font-semibold leading-[26px] tracking-[0.08px] text-[#222325]">
            {title}
        </span>
        <div className="h-[44px] w-[44px]" />
    </header>
);

interface SortablePlaceItemProps {
    place: MySiteView;
    onSettings: (place: MySiteView) => void;
    onDelete: (place: MySiteView) => void;
    onLeave: (place: MySiteView) => void;
}

const SortablePlaceItem = ({ place, onSettings, onDelete, onLeave }: SortablePlaceItemProps) => {
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
                        isOwner ? 'bg-[#102346]' : 'bg-muted'
                    )}
                >
                    <Users size={14} className={isOwner ? 'text-white' : 'text-muted-foreground'} />
                </div>
                <div className="flex items-center gap-[4px]">
                    {!isOwner && <Users size={20} className="text-muted-foreground" />}
                    <span className="text-[16px] font-medium tracking-[-0.32px] text-[#3a3c40]">{place.name}</span>
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

export const PlaceOrderPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { places, setPlaces } = useMyPlaces();
    const [items, setItems] = useState<MySiteView[]>([]);

    // Sync items when places change
    useEffect(() => {
        if (places.length > 0 && items.length === 0) {
            setItems([...places]);
        }
    }, [places, items.length]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 200,
                tolerance: 5,
            },
        }),
        useSensor(KeyboardSensor)
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = items.findIndex(item => item.id === active.id);
            const newIndex = items.findIndex(item => item.id === over.id);
            const newItems = arrayMove(items, oldIndex, newIndex);
            setItems(newItems);
            setPlaces(() => newItems);
        }
    };

    const handleBack = () => {
        navigate(-1);
    };

    const handleSettings = (place: MySiteView) => {
        navigate(`/places/${place.id}`);
    };

    const handleDelete = (place: MySiteView) => {
        // TODO: Implement delete functionality with API
        console.log('Delete:', place.name);
    };

    const handleLeave = (place: MySiteView) => {
        // TODO: Implement leave functionality with API
        console.log('Leave:', place.name);
    };

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <Header title={t('placeOrder.title')} onBack={handleBack} />

            {/* Place List */}
            <div className="flex-1 overflow-y-auto pt-[14px]">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    modifiers={[restrictToVerticalAxis]}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext items={items.map(p => p.id)} strategy={verticalListSortingStrategy}>
                        <div className="flex flex-col gap-[5px]">
                            {items.map(place => (
                                <SortablePlaceItem
                                    key={place.id}
                                    place={place}
                                    onSettings={handleSettings}
                                    onDelete={handleDelete}
                                    onLeave={handleLeave}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            </div>
        </div>
    );
};
