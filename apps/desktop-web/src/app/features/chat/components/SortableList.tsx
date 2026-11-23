import { useRef, type ReactNode } from 'react';

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { cn } from '@chatic/ui-kit';

export interface SortableItem {
    key: string;
    node: ReactNode;
    dragDisabled?: boolean;
}

interface SortableListProps {
    items: SortableItem[];
    disabled?: boolean;
    className?: string;
    onReorder?: (orderedKeys: string[]) => void;
}

const SortableRow = ({
    itemKey,
    disabled,
    justDraggedRef,
    children,
}: {
    itemKey: string;
    disabled: boolean;
    justDraggedRef: React.RefObject<boolean>;
    children: ReactNode;
}) => {
    const { listeners, setNodeRef, transform, transition } = useSortable({ id: itemKey, disabled });
    return (
        <div
            ref={setNodeRef}
            {...listeners}
            style={{ transform: CSS.Translate.toString(transform), transition }}
            className={cn(disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing')}
            onClickCapture={event => {
                if (!justDraggedRef.current) return;
                event.stopPropagation();
                event.preventDefault();
                justDraggedRef.current = false;
            }}
        >
            {children}
        </div>
    );
};

export const SortableList = ({ items, disabled, className, onReorder }: SortableListProps) => {
    const justDraggedRef = useRef(false);
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
    const keys = items.map(item => item.key);

    const handleDragEnd = (event: DragEndEvent) => {
        justDraggedRef.current = true;
        setTimeout(() => {
            justDraggedRef.current = false;
        }, 0);
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const from = keys.indexOf(String(active.id));
        const to = keys.indexOf(String(over.id));
        if (from < 0 || to < 0) return;
        onReorder?.(arrayMove(keys, from, to));
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={handleDragEnd}
        >
            <SortableContext items={keys} strategy={verticalListSortingStrategy}>
                <div className={className}>
                    {items.map(item => (
                        <SortableRow
                            key={item.key}
                            itemKey={item.key}
                            disabled={!!disabled || !!item.dragDisabled}
                            justDraggedRef={justDraggedRef}
                        >
                            {item.node}
                        </SortableRow>
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
};
