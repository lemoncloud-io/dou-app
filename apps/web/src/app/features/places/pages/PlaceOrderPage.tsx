import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/page-transition';

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

import { ConfirmDialog } from '../../chats/components/ConfirmDialog';
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
    const [deleteTarget, setDeleteTarget] = useState<MySiteView | null>(null);
    const [leaveTarget, setLeaveTarget] = useState<MySiteView | null>(null);

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
        setDeleteTarget(place);
    };

    const handleDeleteConfirm = () => {
        if (!deleteTarget) return;
        // TODO: Implement delete API call
        setDeleteTarget(null);
    };

    const handleLeave = (place: MySiteView) => {
        setLeaveTarget(place);
    };

    const handleLeaveConfirm = () => {
        if (!leaveTarget) return;
        // TODO: Implement leave API call
        setLeaveTarget(null);
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

            {/* Delete Place Dialog */}
            <ConfirmDialog
                open={deleteTarget !== null}
                onOpenChange={open => !open && setDeleteTarget(null)}
                title={t('placeOrder.deleteDialog.title')}
                description={t('placeOrder.deleteDialog.description', { name: deleteTarget?.name })}
                confirmLabel={t('placeOrder.deleteDialog.confirm')}
                onConfirm={handleDeleteConfirm}
                variant="danger"
            />

            {/* Leave Place Dialog */}
            <ConfirmDialog
                open={leaveTarget !== null}
                onOpenChange={open => !open && setLeaveTarget(null)}
                title={t('placeOrder.leaveDialog.title')}
                description={t('placeOrder.leaveDialog.description', { name: leaveTarget?.name })}
                confirmLabel={t('placeOrder.leaveDialog.confirm')}
                onConfirm={handleLeaveConfirm}
                variant="danger"
            />
        </div>
    );
};
