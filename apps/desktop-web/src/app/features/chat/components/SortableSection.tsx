import { useRef, type ReactNode } from 'react';

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown } from 'lucide-react';

import { cn } from '@chatic/lib/utils';

import { useSidebarSectionsStore } from '../stores';

export interface SectionItem {
    /** Stable unique key — `<section prefix>:<channel id>`; also the sortable id. */
    key: string;
    node: ReactNode;
    /** Stays visible while the section is folded: the open channel, or one with unread. */
    keepWhenCollapsed: boolean;
}

interface SortableSectionProps {
    /** Persisted fold key (`useSidebarSectionsStore`). */
    id: string;
    title: string;
    /** Trailing control in the header row (the Channels "+"). */
    action?: ReactNode;
    items: SectionItem[];
    /** Rows are not draggable while the section is folded or the list is filtered —
     *  a reordered subset would write a partial order. */
    dragDisabled?: boolean;
    /** Called with the reordered item keys after a drag. Never on a plain click. */
    onReorder?: (orderedKeys: string[]) => void;
}

/**
 * A drop that ends anywhere still counts as a drag: the click browsers fire on
 * pointer-up must not select the row underneath. The flag lives per section and
 * self-clears on a timeout — when the release lands off the originating row the
 * post-drag click fires on the down/up common ancestor, not the row wrapper, so
 * nothing else would clear it and the NEXT legitimate click would be swallowed
 * (review-03 P1). The click is dispatched before timers run, so `setTimeout(…, 0)`
 * is late enough.
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
        // The row button inside keeps its own onClick; this wrapper only carries the
        // pointer listeners. No `attributes`/`tabIndex`: keyboard drag is deliberately
        // not supported (Alt+Shift+↑/↓ instead), so the wrapper must not join tab order.
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
 * Collapsible, drag-reorderable sidebar section (Figma: chevron · 16px semibold title ·
 * optional action). One `DndContext` per section, so a cross-section drop is impossible by
 * construction (decided: cross-section drop would imply favorite semantics).
 *
 * Folding hides the quiet rows, not the ones asking for attention: like Slack, the open
 * channel and anything unread stay listed, so folding a busy section never hides that
 * something arrived. The fold is remembered across launches.
 */
export const SortableSection = ({ id, title, action, items, dragDisabled, onReorder }: SortableSectionProps) => {
    const isCollapsed = useSidebarSectionsStore(s => !!s.collapsed[id]);
    const toggle = useSidebarSectionsStore(s => s.toggle);
    const justDraggedRef = useRef(false);
    // 5px before a press becomes a drag: a click (no move) selects, a small accidental
    // jitter does not reorder (dnd-kit #172).
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
    const visible = isCollapsed ? items.filter(item => item.keepWhenCollapsed) : items;
    const rowDragDisabled = !!dragDisabled || isCollapsed;
    const sortableKeys = visible.map(item => item.key);

    const handleDragEnd = (event: DragEndEvent) => {
        justDraggedRef.current = true;
        setTimeout(() => {
            justDraggedRef.current = false;
        }, 0);
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const from = sortableKeys.indexOf(String(active.id));
        const to = sortableKeys.indexOf(String(over.id));
        if (from < 0 || to < 0) return;
        onReorder?.(arrayMove(sortableKeys, from, to));
    };

    return (
        <section className="flex flex-col gap-1">
            <div className="flex items-center gap-2 py-3">
                <button
                    type="button"
                    onClick={() => toggle(id)}
                    aria-expanded={!isCollapsed}
                    className="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-md text-left"
                >
                    <ChevronDown
                        size={18}
                        aria-hidden
                        className={cn(
                            'shrink-0 text-sidebar-foreground transition-transform duration-150 ease-tactile',
                            isCollapsed && '-rotate-90'
                        )}
                    />
                    <h3 className="truncate text-[16px] font-semibold tracking-[-0.01em] text-sidebar-foreground">
                        {title}
                    </h3>
                </button>
                {action}
            </div>
            {visible.length > 0 && (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext items={sortableKeys} strategy={verticalListSortingStrategy}>
                        <div className="flex flex-col gap-2">
                            {visible.map(item => (
                                <SortableRow
                                    key={item.key}
                                    itemKey={item.key}
                                    disabled={rowDragDisabled}
                                    justDraggedRef={justDraggedRef}
                                >
                                    {item.node}
                                </SortableRow>
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            )}
        </section>
    );
};
