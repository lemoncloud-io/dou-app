import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '../../../shared/hooks';

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
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronLeft } from 'lucide-react';

import { useMyPlaces } from '../../home/hooks/useMyPlaces';
import { SortablePlaceItem } from '../components';

import type { DragEndEvent } from '@dnd-kit/core';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';

interface HeaderProps {
    title: string;
    onBack: () => void;
}

const Header = ({ title, onBack }: HeaderProps) => (
    <header className="flex items-center justify-center px-4 py-3">
        <button onClick={onBack} className="absolute left-4 p-2">
            <ChevronLeft size={24} strokeWidth={2} className="text-foreground" />
        </button>
        <h1 className="text-[17px] font-semibold text-foreground">{title}</h1>
    </header>
);

export const PlaceOrderPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { places, setPlaces } = useMyPlaces();

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
            const oldIndex = places.findIndex(item => item.id === active.id);
            const newIndex = places.findIndex(item => item.id === over.id);
            const newItems = arrayMove(places, oldIndex, newIndex);
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
        <div className="flex min-h-screen flex-col bg-background pt-safe-top">
            <Header title={t('placeOrder.title')} onBack={handleBack} />

            {/* Place List */}
            <div className="flex-1 overflow-y-auto pt-[14px]">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    modifiers={[restrictToVerticalAxis]}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext items={places.map(p => p.id)} strategy={verticalListSortingStrategy}>
                        <div className="flex flex-col gap-[5px]">
                            {places.map(place => (
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
