import { useRef, type ReactNode } from 'react';

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { cn } from '@chatic/lib/utils';

export interface SortableItem {
    /** Stable unique key; also the sortable id. */
    key: string;
    node: ReactNode;
    /** A row with no order of its own to keep is never picked up. */
    dragDisabled?: boolean;
}

interface SortableListProps {
    items: SortableItem[];
    /** Nothing is draggable: the list shows a subset, or a move would land mid-operation. */
    disabled?: boolean;
    /** Layout of the list box. The dragged row is held inside it. */
    className?: string;
    /** Called with the reordered item keys after a drag. Never on a plain click. */
    onReorder?: (orderedKeys: string[]) => void;
}

/**
 * A drop that ends anywhere still counts as a drag: the click browsers fire on
 * pointer-up must not select the row underneath. The flag lives per list and
 * self-clears on a timeout — when the release lands off the originating row the
 * post-drag click fires on the down/up common ancestor, not the row wrapper, so
 * nothing else would clear it and the NEXT legitimate click would be swallowed.
 * The click is dispatched before timers run, so `setTimeout(…, 0)` is late enough.
 */
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
        // The button inside keeps its own onClick; this wrapper only carries the
        // pointer listeners. No `attributes`/`tabIndex`: keyboard drag is deliberately
        // not supported, so the wrapper must not join tab order.
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

/**
 * A vertical list whose rows reorder by dragging (the axis and the sorting strategy are fixed to
 * vertical; a horizontal list needs its own). One `DndContext` per list, so a drop
 * into another list is impossible by construction.
 */
export const SortableList = ({ items, disabled, className, onReorder }: SortableListProps) => {
    const justDraggedRef = useRef(false);
    // 5px before a press becomes a drag: a click (no move) selects, a small accidental
    // jitter does not reorder (dnd-kit #172).
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
