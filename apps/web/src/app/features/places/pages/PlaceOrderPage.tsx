import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';

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

import { cloudCore } from '@chatic/web-core';
import { usePlaces } from '@chatic/data';

import { PageHeader } from '../../../shared/components';
import { ConfirmDialog } from '../../chats/components/ConfirmDialog';
import { SortablePlaceItem } from '../components';

import type { DragEndEvent } from '@dnd-kit/core';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';

export const PlaceOrderPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { places: serverPlaces } = usePlaces();
    const [places, setPlaces] = useState<MySiteView[]>(serverPlaces);

    useEffect(() => {
        if (serverPlaces.length === 0) return;
        const savedOrder = selectedCloudId ? cloudCore.getPlaceOrder(selectedCloudId) : null;
        if (savedOrder) {
            const orderMap = new Map(savedOrder.map((id, idx) => [id, idx]));
            const sorted = [...serverPlaces].sort((a, b) => {
                const ai = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
                const bi = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
                return ai - bi;
            });
            setPlaces(sorted);
        } else {
            setPlaces(serverPlaces);
        }
    }, [serverPlaces]);

    const myId = cloudCore.getCloudToken()?.id;
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

    const selectedCloudId = cloudCore.getSelectedCloudId();

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = places.findIndex(item => item.id === active.id);
        const newIndex = places.findIndex(item => item.id === over.id);
        const reordered = arrayMove(places, oldIndex, newIndex);
        setPlaces(reordered);

        if (selectedCloudId) {
            cloudCore.savePlaceOrder(
                selectedCloudId,
                reordered.map(p => p.id)
            );
        }
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
        <div className="flex min-h-screen flex-col bg-background pt-safe-top">
            <PageHeader title={t('placeOrder.title')} />

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
                            {places.length > 0 ? (
                                places.map(place => (
                                    <SortablePlaceItem
                                        key={place.id}
                                        place={place}
                                        isOwner={place.ownerId === myId}
                                        onSettings={handleSettings}
                                        onDelete={handleDelete}
                                        onLeave={handleLeave}
                                    />
                                ))
                            ) : (
                                <p className="py-8 text-center text-sm text-muted-foreground">
                                    {t('placeOrder.empty')}
                                </p>
                            )}
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
